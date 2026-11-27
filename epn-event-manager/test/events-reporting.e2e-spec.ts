import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import supertest from 'supertest';
import { DataSource } from 'typeorm';
import { EventsModule } from '../src/modules/events/events.module';
import { StatsModule } from '../src/modules/stats/stats.module';

describe('Event reporting (e2e)', () => {
  let app: INestApplication;
  let server: Parameters<typeof supertest>[0];

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          autoLoadEntities: true,
          synchronize: true,
        }),
        EventsModule,
        StatsModule,
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();
    server = app.getHttpServer() as typeof server;
  });

  afterEach(async () => {
    await app.close();
  });

  it('includes queries in the action counts and the total', async () => {
    await supertest(server)
      .get('/stats')
      .expect(200, { create: 0, update: 0, delete: 0, query: 0, total: 0 });

    for (const action of ['CREATE', 'UPDATE', 'DELETE', 'QUERY', 'QUERY']) {
      await supertest(server)
        .post('/events')
        .send({
          source: 'demo',
          entity: 'item',
          action,
          title: 'Example',
          description: 'Event description',
          payload: { id: 1 },
        })
        .expect(201, { ok: true });
    }

    await supertest(server)
      .get('/stats')
      .expect(200, { create: 1, update: 1, delete: 1, query: 2, total: 5 });

    const response = await supertest(server).get('/events').expect(200);
    expect(response.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'DELETE',
          description: 'Event description',
          createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T.*Z$/),
        }),
      ]),
    );
    await supertest(server)
      .post('/events')
      .send({ action: 'UNSUPPORTED' })
      .expect(400);
  });

  it('orders UTC dates across tables and preserves older records and fields', async () => {
    const dataSource = app.get(DataSource);
    const legacy = '27/11/2026, 10:21:10';
    const first = '2026-11-27T10:00:00.000Z';
    const last = '2026-11-27T11:00:00.001Z';
    await dataSource.query(
      'INSERT INTO create_events (title, recorded_at) VALUES (?, ?), (?, ?)',
      ['Later create', last, 'Legacy create', legacy],
    );
    await dataSource.query(
      'INSERT INTO update_events (title, timestamp) VALUES (?, ?)',
      ['Undated update', null],
    );
    await dataSource.query(
      'INSERT INTO delete_events (title, createdAt) VALUES (?, ?)',
      ['Earlier delete', first],
    );
    await dataSource.query(
      'INSERT INTO query_events (title, event_date, query_term) VALUES (?, ?, ?)',
      ['Earlier query', first, 'example'],
    );

    const response = await supertest(server).get('/events').expect(200);
    expect(response.body).toMatchObject([
      { title: 'Undated update', _table: 'update_events', timestamp: null },
      { title: 'Legacy create', _table: 'create_events', recorded_at: legacy },
      { title: 'Earlier delete', _table: 'delete_events', createdAt: first },
      {
        title: 'Earlier query',
        _table: 'query_events',
        event_date: first,
        query_term: 'example',
      },
      { title: 'Later create', _table: 'create_events', recorded_at: last },
    ]);
    expect(response.text.match(/"query_term"/g)).toHaveLength(1);
  });
});
