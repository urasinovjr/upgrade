import type { Student } from "../../domain/models";
import { studentTone } from "../status";

export function Avatar({
  student,
  size = "md",
}: {
  student: Pick<Student, "name" | "color">;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <span
      className={
        "dp-avatar dp-tone-" +
        studentTone(student.color) +
        (size === "md" ? "" : " dp-avatar-" + size)
      }
      aria-hidden="true"
    >
      {student.name
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((word) => word[0])
        .join("")}
    </span>
  );
}
