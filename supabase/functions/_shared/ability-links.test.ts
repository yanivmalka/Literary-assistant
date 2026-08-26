import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildAbilityLinks,
  buildObjectLinks,
  mergeAbilityLinkEntries,
  type AbilityLinkEntity,
} from "./ability-links.ts";

function entry(overrides: Partial<AbilityLinkEntity> & Pick<AbilityLinkEntity, "id" | "canonical_name" | "entity_type">): AbilityLinkEntity {
  return { aliases: [], attributes: {}, ...overrides };
}

Deno.test("character to ability: links a character to an ability via attributes.users", () => {
  const entries = [
    entry({ id: "char-1", canonical_name: "Leah", entity_type: "character" }),
    entry({ id: "ability-1", canonical_name: "Telekinesis", entity_type: "magic_ability", attributes: { users: ["Leah"] } }),
  ];

  const links = buildAbilityLinks(entries);

  assertEquals(links.length, 1);
  assertEquals(links[0], {
    characterId: "char-1",
    abilityId: "ability-1",
    abilityName: "Telekinesis",
    userName: "Leah",
    relationshipType: "has_ability",
  });
});

Deno.test("character to object: links a character to an object via attributes.owners", () => {
  const entries = [
    entry({ id: "char-1", canonical_name: "Leah", entity_type: "character" }),
    entry({ id: "object-1", canonical_name: "Sword of Dawn", entity_type: "object", attributes: { owners: ["Leah"] } }),
  ];

  const links = buildObjectLinks(entries);

  assertEquals(links.length, 1);
  assertEquals(links[0], {
    characterId: "char-1",
    objectId: "object-1",
    objectName: "Sword of Dawn",
    ownerName: "Leah",
    relationshipType: "owns",
  });
});

Deno.test("object owner resolves through an alias, same as ability users", () => {
  const entries = [
    entry({ id: "char-1", canonical_name: "Leah Winters", entity_type: "character", aliases: ["Leah"] }),
    entry({ id: "object-1", canonical_name: "Sword of Dawn", entity_type: "object", attributes: { owners: ["Leah"] } }),
  ];

  assertEquals(buildObjectLinks(entries)[0]?.characterId, "char-1");
});

Deno.test("does not link an object owner name that matches more than one character", () => {
  const entries = [
    entry({ id: "char-1", canonical_name: "Leah", entity_type: "character" }),
    entry({ id: "char-2", canonical_name: "Leah", entity_type: "character" }),
    entry({ id: "object-1", canonical_name: "Sword", entity_type: "object", attributes: { owners: ["Leah"] } }),
  ];

  assertEquals(buildObjectLinks(entries), []);
});

Deno.test("incremental update: an object arriving in a later batch still links to a character persisted from an earlier batch", () => {
  const persisted = [entry({ id: "char-1", canonical_name: "Leah", entity_type: "character" })];
  const currentBatch = [entry({ id: "object-1", canonical_name: "Sword", entity_type: "object", attributes: { owners: ["Leah"] } })];

  const merged = mergeAbilityLinkEntries(persisted, currentBatch);
  const links = buildObjectLinks(merged);

  assertEquals(links.length, 1);
  assertEquals(links[0].characterId, "char-1");
  assertEquals(links[0].objectId, "object-1");
});

Deno.test("does not create duplicate object links when the same owner reference repeats across merged batches", () => {
  const batchOne = [
    entry({ id: "char-1", canonical_name: "Leah", entity_type: "character" }),
    entry({ id: "object-1", canonical_name: "Sword", entity_type: "object", attributes: { owners: ["Leah"] } }),
  ];
  const batchTwo = [
    entry({ id: "object-1", canonical_name: "Sword", entity_type: "object", attributes: { owners: ["Leah"] } }),
  ];

  const merged = mergeAbilityLinkEntries(batchOne, batchTwo);
  const links = buildObjectLinks(merged);

  assertEquals(links.length, 1);
});

Deno.test("ability and object links do not cross-contaminate the same character", () => {
  const entries = [
    entry({ id: "char-1", canonical_name: "Leah", entity_type: "character" }),
    entry({ id: "ability-1", canonical_name: "Telekinesis", entity_type: "magic_ability", attributes: { users: ["Leah"] } }),
    entry({ id: "object-1", canonical_name: "Sword", entity_type: "object", attributes: { owners: ["Leah"] } }),
  ];

  assertEquals(buildAbilityLinks(entries).length, 1);
  assertEquals(buildObjectLinks(entries).length, 1);
});
