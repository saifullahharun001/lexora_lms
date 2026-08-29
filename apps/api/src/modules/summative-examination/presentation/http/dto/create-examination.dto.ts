import { IsString, Matches, MaxLength, MinLength } from "class-validator";

export class CreateExaminationDto {
  @IsString()
  @MinLength(3)
  academicProgramId!: string;

  @IsString()
  @MinLength(3)
  academicSessionId!: string;

  @IsString()
  @MinLength(3)
  academicTermId!: string;

  @IsString()
  @Matches(/\S/)
  @MaxLength(64)
  code!: string;

  @IsString()
  @Matches(/\S/)
  @MaxLength(255)
  name!: string;

  @IsString()
  @Matches(/\S/)
  @MaxLength(64)
  categoryCode!: string;

  @IsString()
  @Matches(/\S/)
  @MaxLength(64)
  ruleVersionCode!: string;
}
