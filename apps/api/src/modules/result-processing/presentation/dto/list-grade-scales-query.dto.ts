import { Transform } from "class-transformer";
import { IsBoolean, IsOptional } from "class-validator";

export class ListGradeScalesQueryDto {
  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  isActive?: boolean;
}

