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
      body: "可以输入 /help、/status、/lookup，或直接输入一个写作意图。输入 /model 可进入模型绑定向导。",
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
      setMessages((current) => [...current, createMessage("user", "你", input)]);
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
          setMessages((current) => [...current, createMessage("assistant", prompt.title, `${prompt.body}\n\n输入 /cancel 可退出向导。`)]);
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
      setModelWizard(null);
      startTransition(() => {
        setMessages((current) => [
          ...current,
          createMessage("assistant", "模型向导", "当前目录还不是 LoreCraft 项目。请先执行 /init 或 /open。"),
        ]);
      });
      return;
    }

    if (input === "/cancel") {
      setModelWizard(null);
      startTransition(() => {
        setMessages((current) => [...current, createMessage("assistant", "模型向导", "已取消模型绑定向导。")]);
      });
      return;
    }

    switch (modelWizard?.step) {
      case "role": {
        const role = resolveRoleInput(input);
        if (!role) {
          return appendWizardError("角色无效，请从 writer / reviewer / extractor / light 中选择。");
        }

        const nextState: ModelWizardState = { ...modelWizard, step: "provider", role };
        setModelWizard(nextState);
        const prompt = getModelWizardPrompt(nextState);
        startTransition(() => {
          setMessages((current) => [...current, createMessage("assistant", prompt.title, prompt.body)]);
        });
        return;
      }

      case "provider": {
        const providerChoice = resolveProviderInput(input);
        if (!providerChoice) {
          return appendWizardError("供应商无效，请从 anthropic / openrouter / moonshot / zhipu / custom 中选择。");
        }

        const nextState: ModelWizardState =
          providerChoice === "custom"
            ? { ...modelWizard, step: "baseUrl", providerChoice }
            : { ...modelWizard, step: "modelId", providerChoice };
        setModelWizard(nextState);
        const prompt = getModelWizardPrompt(nextState);
        startTransition(() => {
          setMessages((current) => [...current, createMessage("assistant", prompt.title, prompt.body)]);
        });
        return;
      }

      case "baseUrl": {
        const baseUrl = input.trim();
        if (!/^https?:\/\//u.test(baseUrl)) {
          return appendWizardError("Base URL 必须以 http:// 或 https:// 开头。");
        }

        const nextState: ModelWizardState = { ...modelWizard, step: "modelId", baseUrl };
        setModelWizard(nextState);
        const prompt = getModelWizardPrompt(nextState);
        startTransition(() => {
          setMessages((current) => [...current, createMessage("assistant", prompt.title, prompt.body)]);
        });
        return;
      }

      case "modelId": {
        const modelId = input.trim();
        if (!modelId) {
          return appendWizardError("模型名称不能为空。");
        }

        const nextState: ModelWizardState = { ...modelWizard, step: "apiKey", modelId };
        setModelWizard(nextState);
        const prompt = getModelWizardPrompt(nextState);
        startTransition(() => {
          setMessages((current) => [...current, createMessage("assistant", prompt.title, prompt.body)]);
        });
        return;
      }

      case "apiKey": {
        const apiKey = input.trim();
        if (!apiKey) {
          return appendWizardError("API Key 不能为空。");
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

  function appendWizardError(message: string) {
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
    paletteMode: modelWizard ? ("wizard" as const) : ("command" as const),
    modelWizardState: modelWizard,
    inputPlaceholder: wizardPrompt?.placeholder ?? "输入命令或写作意图，例如 /lookup 主角、/write ch001、/plan 一个仙侠悬疑故事",
  };
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
