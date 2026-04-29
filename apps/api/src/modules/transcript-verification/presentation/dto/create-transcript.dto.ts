import { IsString, MinLength } from "class-validator";

export class CreateTranscriptDto {
  @IsString()
  @MinLength(3)
  studentUserId!: string;
}
