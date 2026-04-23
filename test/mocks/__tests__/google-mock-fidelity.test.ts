import { afterEach, describe, expect, it } from "vitest";
import { type StartedMocks, startMocks } from "../scripts/start-mocks.ts";

type LabelsResponse = {
  labels?: Array<{ id?: string; name?: string; type?: string }>;
};

type MessageResponse = {
  id?: string;
  threadId?: string;
  labelIds?: string[];
};

type DraftResponse = {
  id?: string;
  message?: MessageResponse;
};

type DraftsResponse = {
  drafts?: DraftResponse[];
  resultSizeEstimate?: number;
};

type WatchResponse = {
  historyId?: string;
  expiration?: string;
};

type HistoryResponse = {
  history?: Array<{ id?: string }>;
  historyId?: string;
};

type ThreadsResponse = {
  threads?: Array<{ id?: string }>;
  resultSizeEstimate?: number;
};

type ThreadResponse = {
  id?: string;
  messages?: MessageResponse[];
};

async function readJson<T>(response: Response): Promise<T> {
  expect(response.headers.get("content-type")).toContain("application/json");
  return (await response.json()) as T;
}

describe("Google mock Gmail fidelity surface", () => {
  let mocks: StartedMocks | null = null;

  afterEach(async () => {
    await mocks?.stop();
    mocks = null;
  });

  it("covers Gmail control-plane and inbox-zero endpoints without touching Google", async () => {
    mocks = await startMocks({ envs: ["google"] });
    const baseUrl = mocks.baseUrls.google;

    const labelsResponse = await fetch(`${baseUrl}/gmail/v1/users/me/labels`);
    expect(labelsResponse.status).toBe(200);
    const labels = await readJson<LabelsResponse>(labelsResponse);
    expect(labels.labels?.map((label) => label.id)).toEqual(
      expect.arrayContaining(["INBOX", "SENT", "DRAFT", "SPAM", "TRASH"]),
    );
    expect(
      labels.labels?.find((label) => label.name === "milady-e2e")?.type,
    ).toBe("user");

    const inboxList = await fetch(
      `${baseUrl}/gmail/v1/users/me/messages?labelIds=INBOX&maxResults=2`,
    );
    expect(inboxList.status).toBe(200);
    const inboxBody = await readJson<{
      messages?: Array<{ id?: string }>;
      nextPageToken?: string;
    }>(inboxList);
    expect(inboxBody.messages?.length).toBe(2);
    expect(inboxBody.nextPageToken).toBe("2");

    const spamList = await fetch(
      `${baseUrl}/gmail/v1/users/me/messages?q=in%3Aspam&includeSpamTrash=true`,
    );
    expect(spamList.status).toBe(200);
    expect(
      (await readJson<{ messages?: Array<{ id?: string }> }>(spamList))
        .messages?.[0]?.id,
    ).toBe("msg-spam");

    const sentList = await fetch(
      `${baseUrl}/gmail/v1/users/me/messages?q=in%3Asent%20older_than%3A3d`,
    );
    expect(sentList.status).toBe(200);
    expect(
      (await readJson<{ messages?: Array<{ id?: string }> }>(sentList))
        .messages?.[0]?.id,
    ).toBe("msg-unresponded-sent");

    const missingMessage = await fetch(
      `${baseUrl}/gmail/v1/users/me/messages/not-real`,
    );
    expect(missingMessage.status).toBe(404);

    const batchModify = await fetch(
      `${baseUrl}/gmail/v1/users/me/messages/batchModify`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: ["msg-finance"],
          addLabelIds: ["IMPORTANT"],
          removeLabelIds: ["UNREAD"],
        }),
      },
    );
    expect(batchModify.status).toBe(200);
    expect(
      mocks
        .requestLedger()
        .some(
          (entry) =>
            entry.method === "POST" &&
            entry.path === "/gmail/v1/users/me/messages/batchModify",
        ),
    ).toBe(true);

    const batchDelete = await fetch(
      `${baseUrl}/gmail/v1/users/me/messages/batchDelete`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: ["msg-newsletter"] }),
      },
    );
    expect(batchDelete.status).toBe(200);

    const trashed = await fetch(
      `${baseUrl}/gmail/v1/users/me/messages/msg-finance/trash`,
      { method: "POST" },
    );
    expect(trashed.status).toBe(200);
    expect((await readJson<MessageResponse>(trashed)).labelIds).toContain(
      "TRASH",
    );

    const untrashed = await fetch(
      `${baseUrl}/gmail/v1/users/me/messages/msg-finance/untrash`,
      { method: "POST" },
    );
    expect(untrashed.status).toBe(200);
    expect((await readJson<MessageResponse>(untrashed)).labelIds).toContain(
      "INBOX",
    );

    const deletedMessage = await fetch(
      `${baseUrl}/gmail/v1/users/me/messages/msg-newsletter`,
      { method: "DELETE" },
    );
    expect(deletedMessage.status).toBe(200);

    const createdDraft = await fetch(`${baseUrl}/gmail/v1/users/me/drafts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: { raw: "VG86IHRlc3RAZXhhbXBsZS50ZXN0Cg==" },
      }),
    });
    expect(createdDraft.status).toBe(200);
    const draft = await readJson<DraftResponse>(createdDraft);
    expect(draft.id?.startsWith("draft-")).toBe(true);
    expect(draft.message?.labelIds).toContain("DRAFT");

    const draftList = await fetch(`${baseUrl}/gmail/v1/users/me/drafts`);
    expect(draftList.status).toBe(200);
    expect((await readJson<DraftsResponse>(draftList)).resultSizeEstimate).toBe(
      1,
    );

    const readDraft = await fetch(
      `${baseUrl}/gmail/v1/users/me/drafts/draft-mock`,
    );
    expect(readDraft.status).toBe(200);
    expect((await readJson<DraftResponse>(readDraft)).id).toBe("draft-mock");

    const sentDraft = await fetch(`${baseUrl}/gmail/v1/users/me/drafts/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "draft-mock" }),
    });
    expect(sentDraft.status).toBe(200);
    expect((await readJson<MessageResponse>(sentDraft)).labelIds).toContain(
      "SENT",
    );

    const deletedDraft = await fetch(
      `${baseUrl}/gmail/v1/users/me/drafts/draft-mock`,
      { method: "DELETE" },
    );
    expect(deletedDraft.status).toBe(200);

    const watch = await fetch(`${baseUrl}/gmail/v1/users/me/watch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        labelIds: ["INBOX"],
        labelFilterBehavior: "include",
        topicName: "projects/milady-e2e/topics/gmail",
      }),
    });
    expect(watch.status).toBe(200);
    const watchBody = await readJson<WatchResponse>(watch);
    expect(watchBody.historyId).toBe("123456");
    expect(Number(watchBody.expiration)).toBeGreaterThan(Date.now());

    const history = await fetch(
      `${baseUrl}/gmail/v1/users/me/history?startHistoryId=123456`,
    );
    expect(history.status).toBe(200);
    const historyBody = await readJson<HistoryResponse>(history);
    expect(historyBody.historyId).toBe("123457");
    expect(historyBody.history?.[0]?.id).toBe("123456");

    const threads = await fetch(`${baseUrl}/gmail/v1/users/me/threads`);
    expect(threads.status).toBe(200);
    expect((await readJson<ThreadsResponse>(threads)).resultSizeEstimate).toBe(
      6,
    );

    const thread = await fetch(
      `${baseUrl}/gmail/v1/users/me/threads/thr-unresponded`,
    );
    expect(thread.status).toBe(200);
    const threadBody = await readJson<ThreadResponse>(thread);
    expect(threadBody.id).toBe("thr-unresponded");
    expect(threadBody.messages?.map((message) => message.id)).toEqual(
      expect.arrayContaining([
        "msg-unresponded-inbound",
        "msg-unresponded-sent",
      ]),
    );

    const modifiedThread = await fetch(
      `${baseUrl}/gmail/v1/users/me/threads/thr-finance/modify`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ removeLabelIds: ["UNREAD"] }),
      },
    );
    expect(modifiedThread.status).toBe(200);
    expect((await readJson<ThreadResponse>(modifiedThread)).id).toBe(
      "thr-finance",
    );

    const trashedThread = await fetch(
      `${baseUrl}/gmail/v1/users/me/threads/thr-finance/trash`,
      { method: "POST" },
    );
    expect(trashedThread.status).toBe(200);

    const untrashedThread = await fetch(
      `${baseUrl}/gmail/v1/users/me/threads/thr-finance/untrash`,
      { method: "POST" },
    );
    expect(untrashedThread.status).toBe(200);

    const filter = await fetch(
      `${baseUrl}/gmail/v1/users/me/settings/filters`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          criteria: { from: "digest@example.com" },
          action: { removeLabelIds: ["INBOX"] },
        }),
      },
    );
    expect(filter.status).toBe(200);
    const filterBody = await readJson<{ id?: string }>(filter);
    expect((filterBody.id ?? "").startsWith("filter-")).toBe(true);
  });
});
