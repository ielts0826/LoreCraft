import { startTransition, useMemo, useState } from "react";

import { setModelBinding } from "../../cli/model-workflows.js";
import { executeTuiInput } from "../commands.js";
import { createModelWizard, getModelWizardPrompt, resolveProviderChoice, resolveProviderInput, resolveRoleInput, type ModelWizardState } from "../model-wizard.js";
import type { CommandMessage, ProjectSnapshot, TuiViewId } from "../model.js";

export function useAgent({
  projectDir,
  snapshot,
  onDirectoryChange,
  onViewChange,
  onAfterCommand,
}: {
  projectDir: string;
  snapshot: ProjectSnapshot | null;
  onDirectoryChange: (directory: string) => void;
  onViewChange: (view: TuiViewId) => void;
  onAfterCommand?: () => Promise<void> | void;
}) {
  const [messages, setMessages] = useState<CommandMessage[]>([
    {
      id: "welcome",
      role: "system",
      title: "LoreCraft 已就绪",
      body: "输入 / 打开命令面板，输入 /model 进入模型绑定向导。",
      timestamp: new Date().toISOString(),
    },
  ]);
  const [pending, setPending] = useState(false);
  const [modelWizard, setModelWizard] = useState<ModelWizardState | null>(null);

  const wizardPrompt = useMemo(
    () => (modelWizard ? getModelWizardPrompt(modelWizard) : null),
    [modelWizard],
  );

  async function submit(rawInput: string) {
    const input = rawInput.trim();
    if (!input) {
      return;
    }

    setPending(true);
    startTransition(() => {
      setMessages((current) => [...current, createMessage("user", "你", shouldMaskInput(modelWizard) ? "<API Key 已输入>" : input)]);
    });

    try {
      if (modelWizard) {
        await handleModelWizardInput(input);
        return;
      }

      if (input === "/model") {
        onViewChange("chat");
        const nextState = createModelWizard();
        setModelWizard(nextState);
        const prompt = getModelWizardPrompt(nextState);
        startTransition(() => {
          setMessages((current) => [...current, createMessage("assistant", prompt.title, `${prompt.body}\n\n按 Esc 或输入 /cancel 可退出向导。`)]);
        });
        return;
      }

      const result = await executeTuiInput({ projectDir, snapshot }, input);
      if (result.nextDirectory) {
        onDirectoryChange(result.nextDirectory);
      }
      if (result.nextView) {
        onViewChange(result.nextView);
      }
      if (onAfterCommand) {
        await onAfterCommand();
      }

      startTransition(() => {
        setMessages((current) => [
          ...(result.clearHistory ? current.slice(0, 1) : current),
          createMessage("assistant", result.title, result.body),
        ]);
      });
    } catch (error) {
      startTransition(() => {
        setMessages((current) => [
          ...current,
          createMessage("assistant", "系统错误", error instanceof Error ? error.message : String(error)),
        ]);
      });
    } finally {
      setPending(false);
    }
  }

  async function handleModelWizardInput(input: string): Promise<void> {
    if (!snapshot?.isProject) {
      cancelModelWizard("当前目录还不是 LoreCraft 项目。请先执行 /init 或 /open。");
      return;
    }

    if (input === "/cancel") {
      cancelModelWizard("已取消模型绑定向导。");
      return;
    }

    switch (modelWizard?.step) {
      case "role": {
        const role = resolveRoleInput(input);
        if (!role) {
          appendWizardError("角色无效，请从 writer / reviewer / extractor / light 中选择。");
          return;
        }

        advanceWizard({ ...modelWizard, step: "provider", role });
        return;
      }

      case "provider": {
        const providerChoice = resolveProviderInput(input);
        if (!providerChoice) {
          appendWizardError("供应商无效，请从 anthropic / openrouter / moonshot / zhipu / custom 中选择。");
          return;
        }

        advanceWizard(
          providerChoice === "custom"
            ? { ...modelWizard, step: "baseUrl", providerChoice }
            : { ...modelWizard, step: "modelId", providerChoice },
        );
        return;
      }

      case "baseUrl": {
        const baseUrl = input.trim();
        if (!/^https?:\/\//u.test(baseUrl)) {
          appendWizardError("Base URL 必须以 http:// 或 https:// 开头。");
          return;
        }

        advanceWizard({ ...modelWizard, step: "modelId", baseUrl });
        return;
      }

      case "modelId": {
        const modelId = input.trim();
        if (!modelId) {
          appendWizardError("模型名称不能为空。");
          return;
        }

        advanceWizard({ ...modelWizard, step: "apiKey", modelId });
        return;
      }

      case "apiKey": {
        const apiKey = input.trim();
        if (!apiKey) {
          appendWizardError("API Key 不能为空。");
          return;
        }

        const role = modelWizard.role;
        const providerChoice = modelWizard.providerChoice;
        const modelId = modelWizard.modelId;
        if (!role || !providerChoice || !modelId) {
          setModelWizard(null);
          throw new Error("模型向导状态不完整，请重新执行 /model。");
        }

        const target = resolveProviderChoice(providerChoice, modelWizard.baseUrl);
        const result = await setModelBinding(
          projectDir,
          role,
          {
            provider: target.provider,
            modelId,
            baseUrl: target.baseUrl,
            apiKey,
            test: true,
          },
        );

        setModelWizard(null);
        if (onAfterCommand) {
          await onAfterCommand();
        }
        startTransition(() => {
          setMessages((current) => [
            ...current,
            createMessage(
              "assistant",
              "模型向导",
              [
                "模型绑定完成。",
                `角色：${role}`,
                `供应商：${providerChoice}`,
                `模型：${modelId}`,
                "",
                result,
              ].join("\n"),
            ),
          ]);
        });
        return;
      }
    }
  }

  function advanceWizard(nextState: ModelWizardState) {
    setModelWizard(nextState);
    const prompt = getModelWizardPrompt(nextState);
    startTransition(() => {
      setMessages((current) => [...current, createMessage("assistant", prompt.title, prompt.body)]);
    });
  }

  function appendWizardError(message: string) {
    startTransition(() => {
      setMessages((current) => [...current, createMessage("assistant", "模型向导", message)]);
    });
  }

  function cancelModelWizard(message = "已退出模型绑定向导，回到主聊天界面。") {
    setModelWizard(null);
    onViewChange("chat");
    startTransition(() => {
      setMessages((current) => [...current, createMessage("assistant", "模型向导", message)]);
    });
  }

  function clear() {
    setMessages((current) => current.slice(0, 1));
    setModelWizard(null);
  }

  return {
    messages,
    pending,
    submit,
    clear,
    cancelModelWizard,
    paletteMode: modelWizard ? ("wizard" as const) : ("command" as const),
    modelWizardState: modelWizard,
    inputPlaceholder: wizardPrompt?.placeholder ?? "输入命令或写作意图，例如 /lookup 主角、/write ch001、/plan 一个仙侠悬疑故事",
  };
}

function shouldMaskInput(modelWizard: ModelWizardState | null): boolean {
  return modelWizard?.step === "apiKey";
}

function createMessage(role: CommandMessage["role"], title: string, body: string): CommandMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    role,
    title,
    body,
    timestamp: new Date().toISOString(),
  };
}
