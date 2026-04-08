export interface RelationshipsGraphQuery {
  search?: string;
  platform?: string;
  limit?: number;
  offset?: number;
}

export interface RelationshipsIdentityHandle {
  entityId: string;
  platform: string;
  handle: string;
}

export interface RelationshipsIdentitySummary {
  entityId: string;
  names: string[];
  platforms: string[];
  handles: RelationshipsIdentityHandle[];
}

export interface RelationshipsPersonSummary {
  groupId: string;
  primaryEntityId: string;
  memberEntityIds: string[];
  displayName: string;
  aliases: string[];
  platforms: string[];
  identities: RelationshipsIdentitySummary[];
  emails: string[];
  phones: string[];
  websites: string[];
  preferredCommunicationChannel: string | null;
  categories: string[];
  tags: string[];
  factCount: number;
  relationshipCount: number;
  lastInteractionAt?: string;
}

export interface RelationshipsPersonFact {
  id: string;
  sourceType: "claim" | "contact" | "memory";
  text: string;
  field?: string;
  value?: string;
  scope?: string;
  confidence?: number;
  updatedAt?: string;
}

export interface RelationshipsConversationMessage {
  id: string;
  entityId?: string;
  speaker: string;
  text: string;
  createdAt?: number;
}

export interface RelationshipsConversationSnippet {
  roomId: string;
  roomName: string;
  lastActivityAt?: string;
  messages: RelationshipsConversationMessage[];
}

export interface RelationshipsGraphEdge {
  id: string;
  sourcePersonId: string;
  targetPersonId: string;
  relationshipTypes: string[];
  sentiment: string;
  strength: number;
  interactionCount: number;
  lastInteractionAt?: string;
  rawRelationshipIds: string[];
}

export interface RelationshipsIdentityEdge {
  id: string;
  sourceEntityId: string;
  targetEntityId: string;
  confidence: number;
  status: string;
}

export interface RelationshipsPersonDetail extends RelationshipsPersonSummary {
  facts: RelationshipsPersonFact[];
  recentConversations: RelationshipsConversationSnippet[];
  relationships: RelationshipsGraphEdge[];
  identityEdges: RelationshipsIdentityEdge[];
}

export interface RelationshipsGraphStats {
  totalPeople: number;
  totalRelationships: number;
  totalIdentities: number;
}

export interface RelationshipsGraphSnapshot {
  people: RelationshipsPersonSummary[];
  relationships: RelationshipsGraphEdge[];
  stats: RelationshipsGraphStats;
}
