import { ClassesManager } from "@/components/admin/classes-manager";

export default async function AdminCourseClassesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ClassesManager courseId={id} />;
}
