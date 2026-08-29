import { IsString, MinLength } from "class-validator";

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
