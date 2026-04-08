export interface RolodexGraphQuery {
  search?: string;
  platform?: string;
  limit?: number;
  offset?: number;
}

export interface RolodexIdentityHandle {
  entityId: string;
  platform: string;
  handle: string;
}

export interface RolodexIdentitySummary {
  entityId: string;
  names: string[];
  platforms: string[];
  handles: RolodexIdentityHandle[];
}

export interface RolodexPersonSummary {
  groupId: string;
  primaryEntityId: string;
  memberEntityIds: string[];
  displayName: string;
  aliases: string[];
  platforms: string[];
  identities: RolodexIdentitySummary[];
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

export interface RolodexPersonFact {
  id: string;
  sourceType: "claim" | "contact" | "memory";
  text: string;
  field?: string;
  value?: string;
  scope?: string;
  confidence?: number;
  updatedAt?: string;
}

export interface RolodexConversationMessage {
  id: string;
  entityId?: string;
  speaker: string;
  text: string;
  createdAt?: number;
}

export interface RolodexConversationSnippet {
  roomId: string;
  roomName: string;
  lastActivityAt?: string;
  messages: RolodexConversationMessage[];
}

export interface RolodexGraphEdge {
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

export interface RolodexIdentityEdge {
  id: string;
  sourceEntityId: string;
  targetEntityId: string;
  confidence: number;
  status: string;
}

export interface RolodexPersonDetail extends RolodexPersonSummary {
  facts: RolodexPersonFact[];
  recentConversations: RolodexConversationSnippet[];
  relationships: RolodexGraphEdge[];
  identityEdges: RolodexIdentityEdge[];
}

export interface RolodexGraphStats {
  totalPeople: number;
  totalRelationships: number;
  totalIdentities: number;
}

export interface RolodexGraphSnapshot {
  people: RolodexPersonSummary[];
  relationships: RolodexGraphEdge[];
  stats: RolodexGraphStats;
}
