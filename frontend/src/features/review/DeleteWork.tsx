import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { gateway } from "../../data/gateway";
import type { Work } from "../../domain/models";
import { ConfirmDelete } from "../../shared/ui";

export function DeleteWork({ work }: { work: Work }) {
  const client = useQueryClient();
  const navigate = useNavigate();
  return (
    <ConfirmDelete
      label="Удалить работу"
      title={"Удалить работу «" + work.title + "»?"}
      description="Удалятся загруженные файлы, черновик и все подтверждённые отчёты этой работы."
      onConfirm={async () => {
        await gateway.removeWork(work.id);
        await client.invalidateQueries({ queryKey: ["store"] });
        navigate("/works", { replace: true });
      }}
    />
  );
}
