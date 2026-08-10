-- DropForeignKey
ALTER TABLE "enrollments" DROP CONSTRAINT "enrollments_course_offering_id_fkey";

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_course_offering_id_fkey" FOREIGN KEY ("course_offering_id") REFERENCES "course_offerings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
