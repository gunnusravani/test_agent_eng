"use client";

import { useEffect, useState } from "react";
import type { ClassSummaryDto, CourseDto } from "@/types/schemas";

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30";

export function CourseClassPicker({
  courseSlug,
  classSlug,
  disabled,
  onCourseChange,
  onClassChange,
}: {
  courseSlug: string | null;
  classSlug: string | null;
  disabled?: boolean;
  onCourseChange: (slug: string) => void;
  onClassChange: (slug: string, title: string) => void;
}) {
  const [courses, setCourses] = useState<CourseDto[]>([]);
  const [classes, setClasses] = useState<ClassSummaryDto[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(false);

  useEffect(() => {
    fetch("/api/courses")
      .then((r) => r.json())
      .then((data) => setCourses(Array.isArray(data) ? data : []))
      .catch(() => setCourses([]));
  }, []);

  useEffect(() => {
    if (!courseSlug) {
      setClasses([]);
      return;
    }
    setLoadingClasses(true);
    fetch(`/api/courses/${courseSlug}/classes`)
      .then((r) => r.json())
      .then((data) => setClasses(Array.isArray(data) ? data : []))
      .catch(() => setClasses([]))
      .finally(() => setLoadingClasses(false));
  }, [courseSlug]);

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <div className="flex-1">
        <label className="mb-1 block text-sm text-muted-foreground" htmlFor="course-select">
          Course
        </label>
        <select
          id="course-select"
          className={selectClass}
          value={courseSlug ?? ""}
          disabled={disabled}
          onChange={(e) => onCourseChange(e.target.value)}
        >
          <option value="" disabled>
            Select a course…
          </option>
          {courses.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.title}
            </option>
          ))}
        </select>
      </div>
      <div className="flex-1">
        <label className="mb-1 block text-sm text-muted-foreground" htmlFor="class-select">
          Class
        </label>
        <select
          id="class-select"
          className={selectClass}
          value={classSlug ?? ""}
          disabled={disabled || !courseSlug || loadingClasses}
          onChange={(e) => {
            const selected = classes.find((c) => c.slug === e.target.value);
            onClassChange(e.target.value, selected?.title ?? "");
          }}
        >
          <option value="" disabled>
            {loadingClasses ? "Loading…" : "Select a class…"}
          </option>
          {classes.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.slug}: {c.title}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
