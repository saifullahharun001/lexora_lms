import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsISO8601, IsString, Length, Matches, ValidateIf, ValidateNested } from "class-validator";
import { ComprehensiveMarkingMode } from "@prisma/client";

export class ComprehensiveConfigurationDto {
  @IsEnum(ComprehensiveMarkingMode) mode!: ComprehensiveMarkingMode;
  @IsISO8601() examDate!: string;
}
export class ComprehensiveAllocationDto {
  @IsString() @Length(3, 128) courseId!: string;
  @IsString() @Length(3, 128) committeeAssignmentId!: string;
}
export class ComprehensiveDistributionDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => ComprehensiveAllocationDto)
  allocations!: ComprehensiveAllocationDto[];
}
export class ComprehensiveMarkDto {
  @IsString() @Matches(/^\d{1,4}(\.\d{1,4})?$/) mark!: string;
  @ValidateIf((_o, value: unknown) => value !== undefined) @IsString() @Length(3, 128) returnId?: string;
}
export class ComprehensiveReasonDto {
  @IsString() @Length(1, 2000) @Matches(/\S/) reason!: string;
}
