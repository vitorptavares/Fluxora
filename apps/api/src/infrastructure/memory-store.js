import { createHash } from "node:crypto";

/**
 * Adaptadores de persistencia em memoria para desenvolvimento e testes.
 * Serao substituidos pela persistencia local definitiva (PP-007) sem alterar
 * o dominio, que depende apenas da interface (findById, findByDocument,
 * insert, list).
 */
export class InMemoryTenantRepository {
  #byTenant = new Map();

  #partition(tenantId) {
    let partition = this.#byTenant.get(tenantId);
    if (!partition) {
      partition = { byId: new Map(), byDocument: new Map() };
      this.#byTenant.set(tenantId, partition);
    }
    return partition;
  }

  findById(tenantId, id) {
    return this.#byTenant.get(tenantId)?.byId.get(id) ?? null;
  }

  findByDocument(tenantId, documentNumber) {
    const id = this.#byTenant.get(tenantId)?.byDocument.get(documentNumber);
    return id ? this.findById(tenantId, id) : null;
  }

  insert(entity) {
    const partition = this.#partition(entity.tenantId);
    if (partition.byId.has(entity.id)) {
      throw new Error(`Duplicate id ${entity.id}`);
    }
    partition.byId.set(entity.id, entity);
    partition.byDocument.set(entity.document.number, entity.id);
  }

  /**
   * Paginacao por cursor em ordem de insercao: `startingAfter` e o id do
   * ultimo item da pagina anterior.
   */
  list(tenantId, { limit, startingAfter } = {}) {
    const items = [...(this.#byTenant.get(tenantId)?.byId.values() ?? [])];
    let start = 0;
    if (startingAfter) {
      const index = items.findIndex((item) => item.id === startingAfter);
      start = index === -1 ? items.length : index + 1;
    }
    const page = items.slice(start, start + limit);
    return { data: page, hasMore: start + limit < items.length };
  }
}

/**
 * Guarda a resposta de cada comando mutavel por (tenant, rota, chave). A
 * mesma chave com corpo diferente e rejeitada para evitar que um retry
 * "reaproveite" o resultado de outra operacao.
 */
export class InMemoryIdempotencyStore {
  #entries = new Map();

  static fingerprint(body) {
    return createHash("sha256").update(JSON.stringify(body ?? null)).digest("hex");
  }

  #key(tenantId, scope, idempotencyKey) {
    return JSON.stringify([tenantId, scope, idempotencyKey]);
  }

  get(tenantId, scope, idempotencyKey) {
    return this.#entries.get(this.#key(tenantId, scope, idempotencyKey)) ?? null;
  }

  save(tenantId, scope, idempotencyKey, entry) {
    this.#entries.set(this.#key(tenantId, scope, idempotencyKey), entry);
  }
}
