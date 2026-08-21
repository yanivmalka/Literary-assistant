export type EntityLayer = 'main' | 'branch';

export interface FakeEntityRecord {
  id: string;
  canonical_name: string;
  entity_type: string;
  layer: EntityLayer;
  branch_id: string | null;
  attributes?: Record<string, unknown>;
}

export interface FakeRelationshipRecord {
  source_entity_id: string;
  target_entity_id: string;
  relationship_type: string;
  branch_id: string | null;
}

export interface FakeEventRecord {
  name: string;
  branch_id: string;
}

/** In-memory repository used by extraction tests; it has no Supabase dependency. */
export class FakeEntityRepository {
  readonly entities: FakeEntityRecord[] = [];
  readonly relationships: FakeRelationshipRecord[] = [];
  readonly events: FakeEventRecord[] = [];

  saveEntity(record: Omit<FakeEntityRecord, 'id'>): FakeEntityRecord {
    const saved = { ...record, id: `fake-entity-${this.entities.length + 1}` };
    this.entities.push(saved);
    return saved;
  }

  saveRelationship(record: FakeRelationshipRecord): void {
    this.relationships.push({ ...record });
  }

  saveEvent(record: FakeEventRecord): void {
    this.events.push({ ...record });
  }

  get writes(): number {
    return this.entities.length + this.relationships.length + this.events.length;
  }
}
