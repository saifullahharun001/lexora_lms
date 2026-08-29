import { IsString, Matches, MaxLength, MinLength } from "class-validator";

export class ResourceIdParamDto {
  @IsString()
  @MinLength(3)
  id!: string;
}

export class ExaminationIdParamDto {
  @IsString()
  @MinLength(3)
  examinationId!: string;
}

export class CommitteeIdParamDto {
  @IsString()
  @MinLength(3)
  committeeId!: string;
}

export class AssignmentIdParamDto {
  @IsString()
  @MinLength(3)
  assignmentId!: string;
}

export class ExaminationCourseIdParamDto {
  @IsString()
  @MinLength(3)
  examinationCourseId!: string;
}

export class ExaminerAssignmentIdParamDto {
  @IsString()
  @MinLength(3)
  assignmentId!: string;
}

export class QuestionConfigurationCourseIdParamDto {
  @IsString()
  @MinLength(3)
  @MaxLength(128)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9_-]+$/)
  examinationCourseId!: string;
}

export class QuestionConfigurationIdParamDto extends QuestionConfigurationCourseIdParamDto {

  @IsString()
  @MinLength(3)
  @MaxLength(128)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9_-]+$/)
  configurationId!: string;
}

export class QuestionConfigurationItemIdParamDto extends QuestionConfigurationIdParamDto {
  @IsString()
  @MinLength(3)
  @MaxLength(128)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9_-]+$/)
  itemId!: string;
}
