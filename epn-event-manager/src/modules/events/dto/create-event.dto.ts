// Normaliza la acción antes de validarla.
import { Transform} from 'class-transformer';
// Incluye reglas de tipo, valores permitidos y longitud.
import {
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidatorConstraint,
  Validate,
  ValidatorConstraintInterface,
} from 'class-validator';

// Limita a 10 KB el JSON serializado del payload.
@ValidatorConstraint({ name: 'maxJsonBytes', async: false })
class MaxJsonBytesConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (value === undefined || value === null) return true;

    try {
      // Cuenta el tamaño real del JSON en bytes UTF-8.
      const json = JSON.stringify(value);
      return (
          typeof json === 'string' &&
          Buffer.byteLength(json, 'utf8') <= 10 * 1024
      );
    } catch {
      // Si no se puede serializar, el payload no es válido.
      return false;
    }
  }

  defaultMessage(): string {
    return 'payload no puede superar 10 KB';
  }
}

// Valida los datos del evento antes de que lleguen al servicio.
export class CreateEventDto {
  // Recorta espacios antes de validar los campos de texto.
  @Transform(({ value }) =>
      typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  source: string;

  @Transform(({ value }) =>
      typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  entity: string;

  // Normaliza la acción para aceptar minúsculas sin ampliar las acciones permitidas.
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,)
  @IsString()
  @IsIn(['CREATE', 'UPDATE', 'DELETE', 'QUERY'])
  action: string;

  @Transform(({ value }) =>
      typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @Transform(({ value }) =>
      typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  description: string;

  // El payload es opcional, pero si llega debe ser un objeto JSON.
  @IsOptional()
  @IsObject()
  @Validate(MaxJsonBytesConstraint)
  payload?: Record<string, unknown>;
}
