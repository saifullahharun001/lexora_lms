import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";

export class CreateTeacherAssignmentDto {
  @IsString()
  @IsNotEmpty()
  teacherUserId!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  @Matches(/^[a-z][a-z0-9_-]{1,63}$/, {
    message:
      "roleCode must start with a lowercase letter and contain only lowercase letters, numbers, underscores, or hyphens",
  })
  roleCode?: string;
}
