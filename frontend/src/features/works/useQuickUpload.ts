import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { decodeUpload } from "../../shared/uploads";
import { useWriteAccess } from "../../shared/session";
import { stageUploads } from "../../shared/uploadHandoff";

export function useQuickUpload() {
  const navigate = useNavigate();
  const { allowed } = useWriteAccess();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const running = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const addFiles = async (files: FileList | null | undefined) => {
    if (!allowed || !files?.length || running.current) return;
    running.current = true;
    setBusy(true);
    setError(undefined);
    try {
      const uploads = await Promise.all(Array.from(files).map(decodeUpload));
      if (!mounted.current) return;
      navigate("/works/new", { state: { uploadToken: stageUploads(uploads) } });
    } catch (cause) {
      if (mounted.current) setError(cause);
    } finally {
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return { busy, error, addFiles, allowed };
}
export type QuickUpload = ReturnType<typeof useQuickUpload>;
