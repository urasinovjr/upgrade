import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Attachment } from "../../domain/models";
import { sentPageImage, sentPages, type SentPage } from "../../data/analysisPages";
import { ErrorMessage } from "../../shared/ui";

function SentImage({ workId, page, label }: { workId: string; page: SentPage; label: string }) {
  const [url, setUrl] = useState<string>();
  const [error, setError] = useState<unknown>();
  useEffect(() => {
    let active = true;
    let created: string | undefined;
    sentPageImage(workId, page.index)
      .then((blob) => {
        created = URL.createObjectURL(blob);
        if (active) setUrl(created);
      })
      .catch((cause) => {
        if (active) setError(cause);
      });
    return () => {
      active = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [workId, page.index]);
  return (
    <figure className="sent-page">
      {url ? <img src={url} alt={label} /> : <ErrorMessage error={error} />}
      <figcaption>
        {label} · {page.width}×{page.height}
      </figcaption>
    </figure>
  );
}

export function SentPages({
  workId,
  runId,
  files,
}: {
  workId: string;
  runId: string;
  files: Attachment[];
}) {
  const query = useQuery({
    queryKey: ["sent-pages", workId, runId],
    queryFn: () => sentPages(workId),
  });
  if (query.error) return <ErrorMessage error={query.error} />;
  if (!query.data) return <p role="status">Загружаем страницы…</p>;
  if (!query.data.length) return <p>Для этого разбора копии страниц не сохранялись.</p>;
  const fileName = (id: string) => files.find((file) => file.id === id)?.name ?? "файл удалён";
  return (
    <>
      <p>Провайдер получил только эти копии: с масками и кадром, без имён файлов и метаданных.</p>
      <div className="sent-pages">
        {query.data.map((page) => (
          <SentImage
            key={page.index}
            workId={workId}
            page={page}
            label={"Страница " + page.page + " · " + fileName(page.fileId)}
          />
        ))}
      </div>
    </>
  );
}
