import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CreateEventDto } from './dto/create-event.dto';
import { CreateEventEntity } from '../../database/entities/create-event.entity';
import { UpdateEventEntity } from '../../database/entities/update-event.entity';
import { DeleteEventEntity } from '../../database/entities/delete-event.entity';
import { QueryEventEntity } from '../../database/entities/query-event.entity';


// Excepciones HTTP y registro de errores inesperados.
import {BadRequestException, HttpException, Injectable, InternalServerErrorException, Logger} from '@nestjs/common';

const eventDateColumns = {
  create_events: 'recorded_at',
  update_events: 'timestamp',
  delete_events: 'createdAt',
  query_events: 'event_date',
} as const;

type EventTable = keyof typeof eventDateColumns;

type EventLogRow = {
  id: number;
  source: string | null;
  entity: string | null;
  action: string | null;
  title: string | null;
  description: string | null;
  payload: string | null;
  eventDate: string | null;
  query_term: string | null;
  _table: EventTable;
};

type EventCounts = {
  create: number;
  update: number;
  delete: number;
  query: number;
};

@Injectable()
export class EventsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(CreateEventEntity)
    private readonly createRepo: Repository<CreateEventEntity>,
    @InjectRepository(UpdateEventEntity)
    private readonly updateRepo: Repository<UpdateEventEntity>,
    @InjectRepository(DeleteEventEntity)
    private readonly deleteRepo: Repository<DeleteEventEntity>,
    @InjectRepository(QueryEventEntity)
    private readonly queryRepo: Repository<QueryEventEntity>,
  ) {}

  private readonly logger = new Logger(EventsService.name);
    async registerEvent(dto: CreateEventDto): Promise<{ ok: boolean }> {
      // Intenta procesar y guardar el evento.
      try {
          const action = (dto.action ?? '').toUpperCase();
          const payloadStr = JSON.stringify(dto.payload ?? {});
          // Adaptativo: fecha en UTC con formato ISO 8601 (no depende de la PC)
          const nowUtc = new Date().toISOString();

          if (action === 'CREATE') {
            const ev = this.createRepo.create({
              source: dto.source,
              entity: dto.entity,
              action: dto.action,
              title: dto.title,
              description: dto.description,
              payload: payloadStr,
              recorded_at: nowUtc,
            });
            await this.createRepo.save(ev);
            return {ok: true};
          }

          if (action === 'UPDATE') {
            const ev = this.updateRepo.create({
              source: dto.source,
              entity: dto.entity,
              action: dto.action,
              title: dto.title,
              description: dto.description,
              payload: payloadStr,
              timestamp: nowUtc,
            });
            await this.updateRepo.save(ev);
            return {ok: true};
          }

          if (action === 'DELETE') {
            const evento = this.deleteRepo.create({
              source: dto.source,
              entity: dto.entity,
              action: dto.action,
              title: dto.title,
              description: dto.description,
              payload: payloadStr,
              createdAt: nowUtc,
            });

            await this.deleteRepo.save(evento);
            return {ok: true};
          }

          if (action === 'QUERY') {
            const ev = this.queryRepo.create({
              source: dto.source,
              entity: dto.entity,
              action: dto.action,
              title: dto.title,
              description: dto.description,
              payload: payloadStr,
              event_date: nowUtc,
            });
            await this.queryRepo.save(ev);
            return {ok: true};
          }

          throw new BadRequestException(
              'Acción no soportada. Usa CREATE, UPDATE, DELETE o QUERY.',
          );
      } catch (error) {
        // Conserva el estado de errores HTTP y registra los fallos inesperados.
        if (error instanceof HttpException) {
          throw error;
        }

        this.logger.error(
            'No se pudo registrar el evento',
            error instanceof Error ? error.stack : String(error),
        );

        throw new InternalServerErrorException(
            'No se pudo registrar el evento',
        );
      }
    }
  async findAll(): Promise<object[]> {
    const eventSelects = Object.entries(eventDateColumns).map(
      ([table, dateColumn]) => `
        SELECT id, source, entity, action, title, description, payload,
               "${dateColumn}" AS eventDate, '${table}' AS _table,
               ${table === 'query_events' ? 'query_term' : 'NULL AS query_term'}
        FROM "${table}"
      `,
    );

    const rows = await this.dataSource.query<EventLogRow[]>(`
      SELECT * FROM (${eventSelects.join(' UNION ALL ')})
      ORDER BY COALESCE(eventDate, '') GLOB '????-??-??T??:??:??.???Z',
               eventDate, _table, id
    `);

    return rows.map(({ eventDate, query_term, ...event }) => ({
      ...event,
      [eventDateColumns[event._table]]: eventDate,
      ...(event._table === 'query_events' ? { query_term } : {}),
    }));
  }

  async findBySource(source: string): Promise<object[]> {
    const creates = await this.createRepo.findBy({ source });
    const updates = await this.updateRepo.findBy({ source });
    const deletes = await this.deleteRepo.findBy({ source });
    const queries = await this.queryRepo.findBy({ source });
    return [...creates, ...updates, ...deletes, ...queries];
  }

  async findByEntity(entity: string): Promise<object[]> {
    // TypeORM aplica parámetros al filtrar por entity
    const creates = await this.createRepo.findBy({ entity });
    const updates = await this.updateRepo.findBy({ entity });
    const deletes = await this.deleteRepo.findBy({ entity });
    const queries = await this.queryRepo.findBy({ entity });
    return [...creates, ...updates, ...deletes, ...queries];
  }

  async getStats(): Promise<EventCounts & { total: number }> {
    const [counts] = await this.dataSource.query<EventCounts[]>(`
      SELECT
        (SELECT COUNT(*) FROM create_events) AS "create",
        (SELECT COUNT(*) FROM update_events) AS "update",
        (SELECT COUNT(*) FROM delete_events) AS "delete",
        (SELECT COUNT(*) FROM query_events) AS "query"
    `);

    return {
      ...counts,
      total: counts.create + counts.update + counts.delete + counts.query,
    };
  }
}
