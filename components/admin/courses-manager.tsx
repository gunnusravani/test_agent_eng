"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { AdminCourseDto } from "@/types/schemas";

const fieldClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 dark:bg-input/30";

interface CourseFormState {
  id?: string;
  slug: string;
  title: string;
  description: string;
  status: "draft" | "published" | "archived";
}

const EMPTY_FORM: CourseFormState = { slug: "", title: "", description: "", status: "draft" };

function statusVariant(status: string): "default" | "secondary" | "outline" {
  if (status === "published") return "default";
  if (status === "archived") return "outline";
  return "secondary";
}

export function CoursesManager() {
  const [courses, setCourses] = useState<AdminCourseDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<CourseFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadCourses() {
    setLoading(true);
    const res = await fetch("/api/admin/courses");
    const data = (await res.json()) as AdminCourseDto[];
    setCourses(data);
    setLoading(false);
  }

  useEffect(() => {
    loadCourses();
  }, []);

  function openCreate() {
    setForm(EMPTY_FORM);
    setError(null);
    setDialogOpen(true);
  }

  function openEdit(course: AdminCourseDto) {
    setForm({ id: course.id, slug: course.slug, title: course.title, description: course.description ?? "", status: course.status });
    setError(null);
    setDialogOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const isEdit = Boolean(form.id);
      const url = isEdit ? `/api/admin/courses/${form.id}` : "/api/admin/courses";
      const body = isEdit
        ? { slug: form.slug, title: form.title, description: form.description || null, status: form.status }
        : { slug: form.slug, title: form.title, description: form.description || undefined };

      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Failed to save course.");
        return;
      }
      toast.success(isEdit ? "Course updated." : "Course created.");
      setDialogOpen(false);
      await loadCourses();
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  }

  async function handleArchiveToggle(course: AdminCourseDto) {
    const archiving = course.status !== "archived";
    const res = archiving
      ? await fetch(`/api/admin/courses/${course.id}`, { method: "DELETE" })
      : await fetch(`/api/admin/courses/${course.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "draft" }),
        });
    if (!res.ok) {
      toast.error(archiving ? "Failed to archive course." : "Failed to unarchive course.");
      return;
    }
    toast.success(archiving ? "Course archived." : "Course unarchived.");
    await loadCourses();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Courses</h1>
        <Button onClick={openCreate}>New Course</Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit Course" : "New Course"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="mb-1 block text-sm text-muted-foreground" htmlFor="course-slug">
                Slug
              </label>
              <Input
                id="course-slug"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                placeholder="agent-engineering"
                required
                disabled={saving}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-muted-foreground" htmlFor="course-title">
                Title
              </label>
              <Input
                id="course-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Agent Engineering"
                required
                disabled={saving}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-muted-foreground" htmlFor="course-description">
                Description
              </label>
              <textarea
                id="course-description"
                className={`${fieldClass} min-h-20 py-1.5`}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                disabled={saving}
              />
            </div>
            {form.id && (
              <div>
                <label className="mb-1 block text-sm text-muted-foreground" htmlFor="course-status">
                  Status
                </label>
                <select
                  id="course-status"
                  className={fieldClass}
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as CourseFormState["status"] })}
                  disabled={saving}
                >
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={saving} className="w-full">
              {saving ? "Saving…" : "Save"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : courses.length === 0 ? (
            <p className="text-sm text-muted-foreground">No courses yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-1.5 pr-4 font-medium">Title</th>
                    <th className="py-1.5 pr-4 font-medium">Slug</th>
                    <th className="py-1.5 pr-4 font-medium">Status</th>
                    <th className="py-1.5 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {courses.map((course) => (
                    <tr key={course.id} className="border-b last:border-0">
                      <td className="py-1.5 pr-4">
                        <Link href={`/admin/courses/${course.id}/classes`} className="hover:underline">
                          {course.title}
                        </Link>
                      </td>
                      <td className="py-1.5 pr-4 font-mono text-xs text-muted-foreground">{course.slug}</td>
                      <td className="py-1.5 pr-4">
                        <Badge variant={statusVariant(course.status)}>{course.status}</Badge>
                      </td>
                      <td className="py-1.5">
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => openEdit(course)}>
                            Edit
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => handleArchiveToggle(course)}>
                            {course.status === "archived" ? "Unarchive" : "Archive"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
