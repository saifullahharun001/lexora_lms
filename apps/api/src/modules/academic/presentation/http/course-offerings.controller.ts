import { Body, Controller, Get, Param, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";

import { RequirePolicy } from "@/modules/authorization/decorators/require-policy.decorator";
import { AuthGuard } from "@/modules/authorization/guards/auth.guard";
import { PolicyGuard } from "@/modules/authorization/guards/policy.guard";

import { AcademicService } from "../../application/services/academic.service";
import { ACADEMIC_POLICY_NAMES } from "../../domain/academic.policy-names";
import { BindCourseOfferingCurriculumDto } from "../dto/bind-course-offering-curriculum.dto";
import { BindCourseOfferingSyllabusDto } from "../dto/bind-course-offering-syllabus.dto";
import { BindCourseOfferingStudentBatchDto } from "../dto/bind-course-offering-student-batch.dto";
import { CourseOutlineVersionParamDto } from "../dto/course-outline-version-param.dto";
import { CreateCourseOfferingDto } from "../dto/create-course-offering.dto";
import { CreateCourseOutlineVersionDto } from "../dto/create-course-outline-version.dto";
import { CreateTeacherAssignmentDto } from "../dto/create-teacher-assignment.dto";
import { ListCourseOfferingsQueryDto } from "../dto/list-course-offerings-query.dto";
import { ListMyCourseOfferingsQueryDto } from "../dto/list-my-course-offerings-query.dto";
import { ResourceIdParamDto } from "../dto/resource-id-param.dto";
import { ReturnCourseOutlineForCorrectionDto } from "../dto/return-course-outline-for-correction.dto";
import { UpdateCourseOfferingDto } from "../dto/update-course-offering.dto";
import { UpdateCourseOutlineVersionDto } from "../dto/update-course-outline-version.dto";

@Controller({
  path: "course-offerings",
  version: "1"
})
@UseGuards(AuthGuard, PolicyGuard)
export class CourseOfferingsController {
  constructor(private readonly academicService: AcademicService) {}

  @Post()
  @RequirePolicy(ACADEMIC_POLICY_NAMES.OFFERING_MANAGE)
  create(@Body() body: CreateCourseOfferingDto) {
    return this.academicService.createCourseOffering(body);
  }

  @Get()
  @RequirePolicy(ACADEMIC_POLICY_NAMES.OFFERING_READ)
  list(@Query() query: ListCourseOfferingsQueryDto) {
    return this.academicService.listCourseOfferings(query);
  }

  @Get("me")
  @RequirePolicy(ACADEMIC_POLICY_NAMES.ENROLLMENT_SELF_REQUEST)
  listMine(@Query() query: ListMyCourseOfferingsQueryDto) {
    return this.academicService.listMyCourseOfferings(query);
  }

  @Get(":id")
  @RequirePolicy(ACADEMIC_POLICY_NAMES.OFFERING_READ)
  getById(@Param() params: ResourceIdParamDto) {
    return this.academicService.getCourseOffering(params.id);
  }

  @Get(":id/syllabus")
  @RequirePolicy(ACADEMIC_POLICY_NAMES.OFFERING_READ)
  getSyllabus(@Param() params: ResourceIdParamDto) {
    return this.academicService.getCourseOfferingSyllabus(params.id);
  }

  @Get(":id/learning-outcomes")
  @RequirePolicy(ACADEMIC_POLICY_NAMES.OFFERING_READ)
  getLearningOutcomes(@Param() params: ResourceIdParamDto) {
    return this.academicService.getCourseOfferingLearningOutcomes(params.id);
  }

  @Post(":id/course-outline-versions")
  @RequirePolicy(ACADEMIC_POLICY_NAMES.COURSE_OUTLINE_WRITE)
  createCourseOutlineVersion(
    @Param() params: ResourceIdParamDto,
    @Body() body: CreateCourseOutlineVersionDto,
  ) {
    return this.academicService.createCourseOutlineVersion(params.id, body);
  }

  @Get(":id/course-outline-versions")
  @RequirePolicy(ACADEMIC_POLICY_NAMES.COURSE_OUTLINE_READ)
  listCourseOutlineVersions(@Param() params: ResourceIdParamDto) {
    return this.academicService.listCourseOutlineVersions(params.id);
  }

  @Get(":id/course-outline-versions/:courseOutlineVersionId")
  @RequirePolicy(ACADEMIC_POLICY_NAMES.COURSE_OUTLINE_READ)
  getCourseOutlineVersion(@Param() params: CourseOutlineVersionParamDto) {
    return this.academicService.getCourseOutlineVersion(
      params.id,
      params.courseOutlineVersionId,
    );
  }

  @Patch(":id/course-outline-versions/:courseOutlineVersionId")
  @RequirePolicy(ACADEMIC_POLICY_NAMES.COURSE_OUTLINE_WRITE)
  updateCourseOutlineVersion(
    @Param() params: CourseOutlineVersionParamDto,
    @Body() body: UpdateCourseOutlineVersionDto,
  ) {
    return this.academicService.updateCourseOutlineVersion(
      params.id,
      params.courseOutlineVersionId,
      body,
    );
  }

  @Post(":id/course-outline-versions/:courseOutlineVersionId/submit")
  @RequirePolicy(ACADEMIC_POLICY_NAMES.COURSE_OUTLINE_SUBMIT)
  submitCourseOutlineVersion(@Param() params: CourseOutlineVersionParamDto) {
    return this.academicService.submitCourseOutlineVersion(
      params.id,
      params.courseOutlineVersionId,
    );
  }

  @Post(
    ":id/course-outline-versions/:courseOutlineVersionId/coordinator-review",
  )
  @RequirePolicy(ACADEMIC_POLICY_NAMES.COURSE_OUTLINE_COORDINATOR_REVIEW)
  startCourseOutlineCoordinatorReview(
    @Param() params: CourseOutlineVersionParamDto,
  ) {
    return this.academicService.startCourseOutlineCoordinatorReview(
      params.id,
      params.courseOutlineVersionId,
    );
  }

  @Post(":id/course-outline-versions/:courseOutlineVersionId/approve")
  @RequirePolicy(ACADEMIC_POLICY_NAMES.COURSE_OUTLINE_APPROVE)
  approveCourseOutlineVersion(@Param() params: CourseOutlineVersionParamDto) {
    return this.academicService.approveCourseOutlineVersion(
      params.id,
      params.courseOutlineVersionId,
    );
  }

  @Post(":id/course-outline-versions/:courseOutlineVersionId/activate")
  @RequirePolicy(ACADEMIC_POLICY_NAMES.COURSE_OUTLINE_ACTIVATE)
  activateCourseOutlineVersion(@Param() params: CourseOutlineVersionParamDto) {
    return this.academicService.activateCourseOutlineVersion(
      params.id,
      params.courseOutlineVersionId,
    );
  }

  @Post(":id/course-outline-versions/:courseOutlineVersionId/archive")
  @RequirePolicy(ACADEMIC_POLICY_NAMES.COURSE_OUTLINE_ARCHIVE)
  archiveCourseOutlineVersion(@Param() params: CourseOutlineVersionParamDto) {
    return this.academicService.archiveCourseOutlineVersion(
      params.id,
      params.courseOutlineVersionId,
    );
  }

  @Post(
    ":id/course-outline-versions/:courseOutlineVersionId/return-for-correction",
  )
  @RequirePolicy(ACADEMIC_POLICY_NAMES.COURSE_OUTLINE_RETURN_FOR_CORRECTION)
  returnCourseOutlineForCorrection(
    @Param() params: CourseOutlineVersionParamDto,
    @Body() body: ReturnCourseOutlineForCorrectionDto,
  ) {
    return this.academicService.returnCourseOutlineForCorrection(
      params.id,
      params.courseOutlineVersionId,
      body.reason,
    );
  }

  @Patch(":id")
  @RequirePolicy(ACADEMIC_POLICY_NAMES.OFFERING_MANAGE)
  update(@Param() params: ResourceIdParamDto, @Body() body: UpdateCourseOfferingDto) {
    return this.academicService.updateCourseOffering(params.id, body);
  }

  @Put(":id/curriculum-binding")
  @RequirePolicy(ACADEMIC_POLICY_NAMES.CURRICULUM_BINDING_MANAGE)
  bindCurriculum(
    @Param() params: ResourceIdParamDto,
    @Body() body: BindCourseOfferingCurriculumDto,
  ) {
    return this.academicService.bindCourseOfferingCurriculum(
      params.id,
      body.curriculumCourseId,
    );
  }

  @Put(":id/syllabus-binding")
  @RequirePolicy(ACADEMIC_POLICY_NAMES.SYLLABUS_BINDING_MANAGE)
  bindSyllabus(
    @Param() params: ResourceIdParamDto,
    @Body() body: BindCourseOfferingSyllabusDto,
  ) {
    return this.academicService.bindCourseOfferingSyllabus(
      params.id,
      body.syllabusVersionId,
    );
  }

  @Put(":id/student-batch-binding")
  @RequirePolicy(ACADEMIC_POLICY_NAMES.STUDENT_BATCH_BINDING_MANAGE)
  bindStudentBatch(
    @Param() params: ResourceIdParamDto,
    @Body() body: BindCourseOfferingStudentBatchDto,
  ) {
    return this.academicService.bindCourseOfferingStudentBatch(
      params.id,
      body.studentBatchId,
    );
  }

  @Post(":id/teacher-assignments")
  @RequirePolicy(ACADEMIC_POLICY_NAMES.TEACHER_ASSIGNMENT_MANAGE)
  assignTeacher(
    @Param() params: ResourceIdParamDto,
    @Body() body: CreateTeacherAssignmentDto,
  ) {
    return this.academicService.assignTeacherToCourseOffering(params.id, body);
  }

  @Get(":id/teacher-assignments")
  @RequirePolicy(ACADEMIC_POLICY_NAMES.TEACHER_ASSIGNMENT_MANAGE)
  listTeacherAssignments(@Param() params: ResourceIdParamDto) {
    return this.academicService.listTeacherAssignmentsForCourseOffering(
      params.id,
    );
  }
}
