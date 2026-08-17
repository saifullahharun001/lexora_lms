import { Transform } from "class-transformer";
import { IsNotEmpty, IsString, MaxLength } from "class-validator";

const trimString = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

export class TransitionSyllabusVersionDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;
}
