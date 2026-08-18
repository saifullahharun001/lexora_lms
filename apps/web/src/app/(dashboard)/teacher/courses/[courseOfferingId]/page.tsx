import { TeacherCourseWorkspace } from "@/components/teacher/teacher-course-workspace";

interface TeacherCourseWorkspacePageProps {
  params: Promise<{
    courseOfferingId: string;
  }>;
}

export default async function TeacherCourseWorkspacePage({
  params
}: TeacherCourseWorkspacePageProps) {
  const { courseOfferingId } = await params;

  return <TeacherCourseWorkspace courseOfferingId={courseOfferingId} />;
}
