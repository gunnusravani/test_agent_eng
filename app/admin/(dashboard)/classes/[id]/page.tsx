import { ClassEditor } from "@/components/admin/class-editor";

export default async function AdminClassEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ClassEditor classId={id} />;
}
