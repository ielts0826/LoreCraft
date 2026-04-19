import { startTransition, useEffect, useState } from "react";

import { readProjectSnapshot, type ProjectSnapshot } from "../model.js";

export function useProject(projectDir: string) {
  const [snapshot, setSnapshot] = useState<ProjectSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const nextSnapshot = await readProjectSnapshot(projectDir);
        if (cancelled) {
          return;
        }

        startTransition(() => {
          setSnapshot(nextSnapshot);
          setError(nextSnapshot.problem);
        });
      } catch (loadError) {
        if (cancelled) {
          return;
        }

        setError(loadError instanceof Error ? loadError.message : String(loadError));
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    const timer = setInterval(() => {
      void load();
    }, 15_000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [projectDir]);

  async function refresh() {
    setLoading(true);
    try {
      const nextSnapshot = await readProjectSnapshot(projectDir);
      startTransition(() => {
        setSnapshot(nextSnapshot);
        setError(nextSnapshot.problem);
      });
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError));
    } finally {
      setLoading(false);
    }
  }

  return {
    snapshot,
    loading,
    error,
    refresh,
  };
}

