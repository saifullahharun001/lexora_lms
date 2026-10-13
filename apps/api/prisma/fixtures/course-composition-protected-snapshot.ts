import { PrismaClient } from '@prisma/client';

const protectedTables = ['comprehensive_examinations', 'comprehensive_marks', 'comprehensive_roster_entries', 'formative_activities_final_source_items', 'formative_attendance_source_items', 'summative_examiner_comparisons', 'summative_examiner_mark_submissions', 'summative_examiner_question_marks',
  'summative_calculated_marks', 'summative_committee_member_reviews', 'summative_chairman_approvals',
  'formative_activities_finalisations', 'formative_activities_final_results',
  'formative_attendance_generations', 'formative_attendance_versions',
  'comprehensive_finalisations', 'comprehensive_final_results', 'comprehensive_final_sources',
  'formative_final_results', 'course_result_compositions', 'audit_logs'] as const;

/** Full records, not just counts: a rejected operation may not rewrite evidence. */
export async function protectedSnapshot(db: PrismaClient): Promise<string> {
  const rows = [];
  for (const table of protectedTables) rows.push(await db.$queryRawUnsafe(
    'SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id), \'[]\'::jsonb)::text AS snapshot FROM "' + table + '" t'));
  return JSON.stringify(rows);
}
