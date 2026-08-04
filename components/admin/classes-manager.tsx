"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { AdminClassDto, AdminCourseDto } from "@/types/schemas";

const fieldClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 dark:bg-input/30";

interface ClassFormState {
  id?: string;
  slug: string;
  title: string;
  orderIndex: number;
  expectedForkOf: string;
  status: "draft" | "published" | "archived";
}

function emptyForm(nextOrderIndex: number): ClassFormState {
  return { slug: "", title: "", orderIndex: nextOrderIndex, expectedForkOf: "", status: "draft" };
}

function statusVariant(status: string): "default" | "secondary" | "outline" {
  if (status === "published") return "default";
  if (status === "archived") return "outline";
  return "secondary";
}

export function ClassesManager({ courseId }: { courseId: string }) {
  const [course, setCourse] = useState<AdminCourseDto | null>(null);
  const [classes, setClasses] = useState<AdminClassDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<ClassFormState>(emptyForm(0));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    const [coursesRes, classesRes] = await Promise.all([fetch("/api/admin/courses"), fetch(`/api/admin/classes?courseId=${courseId}`)]);
    const coursesData = (await coursesRes.json()) as AdminCourseDto[];
    const classesData = (await classesRes.json()) as AdminClassDto[];
    setCourse(coursesData.find((c) => c.id === courseId) ?? null);
    setClasses(classesData);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  function openCreate() {
    setForm(emptyForm(classes.length));
    setError(null);
    setDialogOpen(true);
  }

  function openEdit(classRow: AdminClassDto) {
    setForm({
      id: classRow.id,
      slug: classRow.slug,
      title: classRow.title,
      orderIndex: classRow.orderIndex,
      expectedForkOf: classRow.expectedForkOf ?? "",
      status: classRow.status,
    });
    setError(null);
    setDialogOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const isEdit = Boolean(form.id);
      const url = isEdit ? `/api/admin/classes/${form.id}` : "/api/admin/classes";
      const body = isEdit
        ? {
            slug: form.slug,
            title: form.title,
            orderIndex: form.orderIndex,
            expectedForkOf: form.expectedForkOf || null,
            status: form.status,
          }
        : {
            courseId,
            slug: form.slug,
            title: form.title,
            orderIndex: form.orderIndex,
            expectedForkOf: form.expectedForkOf || undefined,
          };

      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Failed to save class.");
        return;
      }
      toast.success(isEdit ? "Class updated." : "Class created.");
      setDialogOpen(false);
      await loadData();
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  }

  async function handleArchiveToggle(classRow: AdminClassDto) {
    const archiving = classRow.status !== "archived";
    const res = archiving
      ? await fetch(`/api/admin/classes/${classRow.id}`, { method: "DELETE" })
      : await fetch(`/api/admin/classes/${classRow.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "draft" }),
        });
    if (!res.ok) {
      toast.error(archiving ? "Failed to archive class." : "Failed to unarchive class.");
      return;
    }
    toast.success(archiving ? "Class archived." : "Class unarchived.");
    await loadData();
  }

  return (
    <div className="space-y-6">
      <Link href="/admin/courses" className="text-sm text-muted-foreground hover:underline">
        ← Courses
      </Link>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{course ? `${course.title} — Classes` : "Classes"}</h1>
        <Button onClick={openCreate}>New Class</Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit Class" : "New Class"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="mb-1 block text-sm text-muted-foreground" htmlFor="class-slug">
                Slug
              </label>
              <Input
                id="class-slug"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                placeholder="class-01"
                required
                disabled={saving}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-muted-foreground" htmlFor="class-title">
                Title
              </label>
              <Input
                id="class-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="class-01"
                required
                disabled={saving}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-muted-foreground" htmlFor="class-order">
                Order Index
              </label>
              <Input
                id="class-order"
                type="number"
                value={form.orderIndex}
                onChange={(e) => setForm({ ...form, orderIndex: Number(e.target.value) })}
                required
                disabled={saving}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-muted-foreground" htmlFor="class-fork">
                Expected Fork Of (optional)
              </label>
              <Input
                id="class-fork"
                value={form.expectedForkOf}
                onChange={(e) => setForm({ ...form, expectedForkOf: e.target.value })}
                placeholder="owner/repo"
                disabled={saving}
              />
            </div>
            {form.id && (
              <div>
                <label className="mb-1 block text-sm text-muted-foreground" htmlFor="class-status">
                  Status
                </label>
                <select
                  id="class-status"
                  className={fieldClass}
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as ClassFormState["status"] })}
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
          ) : classes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No classes yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-1.5 pr-4 font-medium">Order</th>
                    <th className="py-1.5 pr-4 font-medium">Title</th>
                    <th className="py-1.5 pr-4 font-medium">Slug</th>
                    <th className="py-1.5 pr-4 font-medium">Status</th>
                    <th className="py-1.5 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {classes.map((classRow) => (
                    <tr key={classRow.id} className="border-b last:border-0">
                      <td className="py-1.5 pr-4 tabular-nums">{classRow.orderIndex}</td>
                      <td className="py-1.5 pr-4">
                        <Link href={`/admin/classes/${classRow.id}`} className="hover:underline">
                          {classRow.title}
                        </Link>
                      </td>
                      <td className="py-1.5 pr-4 font-mono text-xs text-muted-foreground">{classRow.slug}</td>
                      <td className="py-1.5 pr-4">
                        <Badge variant={statusVariant(classRow.status)}>{classRow.status}</Badge>
                      </td>
                      <td className="py-1.5">
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => openEdit(classRow)}>
                            Edit
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => handleArchiveToggle(classRow)}>
                            {classRow.status === "archived" ? "Unarchive" : "Archive"}
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
