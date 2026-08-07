"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { gradeColor } from "@/lib/grades";
import type { AdminClassDto, AdminCourseDto, AdminStudentClassSummary } from "@/types/schemas";

const PAGE_SIZE = 20;

const fieldClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30";

export function StudentsList() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [courseId, setCourseId] = useState("");
  const [classId, setClassId] = useState("");
  const [courses, setCourses] = useState<AdminCourseDto[]>([]);
  const [classes, setClasses] = useState<AdminClassDto[]>([]);
  const [rows, setRows] = useState<AdminStudentClassSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/courses")
      .then((res) => res.json())
      .then((data: AdminCourseDto[]) => setCourses(Array.isArray(data) ? data : []))
      .catch(() => setCourses([]));
  }, []);

  useEffect(() => {
    if (!courseId) {
      setClasses([]);
      return;
    }
    fetch(`/api/admin/classes?courseId=${courseId}`)
      .then((res) => res.json())
      .then((data: AdminClassDto[]) => setClasses(Array.isArray(data) ? data : []))
      .catch(() => setClasses([]));
  }, [courseId]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, courseId, classId]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (courseId) params.set("courseId", courseId);
    if (classId) params.set("classId", classId);
    fetch(`/api/admin/students?${params.toString()}`)
      .then((res) => res.json())
      .then((data: { rows?: AdminStudentClassSummary[]; total?: number }) => {
        setRows(data.rows ?? []);
        setTotal(data.total ?? 0);
      })
      .finally(() => setLoading(false));
  }, [debouncedSearch, courseId, classId, page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Students</h1>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Input
          placeholder="Search by GitHub username…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="sm:max-w-xs"
        />
        <select
          className={`${fieldClass} sm:max-w-xs`}
          value={courseId}
          onChange={(e) => {
            setCourseId(e.target.value);
            setClassId("");
          }}
        >
          <option value="">All courses</option>
          {courses.map((course) => (
            <option key={course.id} value={course.id}>
              {course.title}
            </option>
          ))}
        </select>
        <select
          className={`${fieldClass} sm:max-w-xs`}
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
          disabled={!courseId}
        >
          <option value="">All classes</option>
          {classes.map((classRow) => (
            <option key={classRow.id} value={classRow.id}>
              {classRow.title}
            </option>
          ))}
        </select>
      </div>

      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No students found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-1.5 pr-4 font-medium">Rank</th>
                    <th className="py-1.5 pr-4 font-medium">GitHub Username</th>
                    <th className="py-1.5 pr-4 font-medium">Course</th>
                    <th className="py-1.5 pr-4 font-medium">Max Grade</th>
                    <th className="py-1.5 pr-4 font-medium">Latest Grade</th>
                    <th className="py-1.5 pr-4 font-medium">Attempts</th>
                    <th className="py-1.5 font-medium">Last Attempt</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const isNewClassGroup = i === 0 || rows[i - 1].classId !== row.classId;
                    return (
                      <Fragment key={`${row.studentId}-${row.classId}`}>
                        {isNewClassGroup && (
                          <tr key={`group-${row.classId}`} className="border-b bg-muted/40">
                            <td colSpan={7} className="py-1.5 pr-4 font-medium">
                              {row.classTitle}
                            </td>
                          </tr>
                        )}
                        <tr key={`${row.studentId}-${row.classId}`} className="border-b last:border-0">
                          <td className="py-1.5 pr-4 tabular-nums text-muted-foreground">
                            {row.maxScore != null ? (row.rank === 1 ? "🏆 1" : row.rank) : "—"}
                          </td>
                          <td className="py-1.5 pr-4">
                            <Link href={`/admin/students/${row.githubUsername}`} className="hover:underline">
                              {row.githubUsername}
                            </Link>
                          </td>
                          <td className="py-1.5 pr-4 text-muted-foreground">{row.courseTitle}</td>
                          <td className={`py-1.5 pr-4 font-medium ${row.maxGrade ? gradeColor(row.maxGrade) : ""}`}>
                            {row.maxGrade ?? "—"}
                          </td>
                          <td className={`py-1.5 pr-4 font-medium ${row.latestGrade ? gradeColor(row.latestGrade) : ""}`}>
                            {row.latestGrade ?? "—"}
                          </td>
                          <td className="py-1.5 pr-4 tabular-nums">{row.attempts}</td>
                          <td className="py-1.5 whitespace-nowrap tabular-nums">{new Date(row.lastAttemptAt).toLocaleString()}</td>
                        </tr>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {page} of {totalPages} ({total} results)
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
