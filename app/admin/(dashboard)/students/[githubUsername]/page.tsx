import { StudentDetailView } from "@/components/admin/student-detail-view";

export default async function AdminStudentDetailPage({ params }: { params: Promise<{ githubUsername: string }> }) {
  const { githubUsername } = await params;
  return <StudentDetailView githubUsername={githubUsername} />;
}
