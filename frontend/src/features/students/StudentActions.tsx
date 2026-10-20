import { useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore } from "lucide-react";
import { useNavigate } from "react-router";
import { gateway } from "../../data/gateway";
import type { Student } from "../../domain/models";
import { useCommand } from "../../shared/query";
import { ConfirmDelete } from "../../shared/ui";

export function StudentActions({ student }: { student: Student }) {
  const command = useCommand();
  const client = useQueryClient();
  const navigate = useNavigate();
  const archived = Boolean(student.archivedAt);
  return (
    <>
      <button
        className="dp-compact-action"
        disabled={command.isPending}
        onClick={() => command.mutate(() => gateway.archiveStudent(student.id, !archived))}
      >
        {archived ? (
          <ArchiveRestore size={14} aria-hidden="true" />
        ) : (
          <Archive size={14} aria-hidden="true" />
        )}
        <span>{archived ? "Вернуть из архива" : "В архив"}</span>
      </button>
      <ConfirmDelete
        label="Удалить"
        title={"Удалить ученика " + student.name + "?"}
        description="Вместе с учеником удалятся его работы, файлы, отчёты и история пробелов."
        onConfirm={async () => {
          await gateway.removeStudent(student.id);
          await client.invalidateQueries({ queryKey: ["store"] });
          navigate("/students", { replace: true });
        }}
      />
    </>
  );
}
