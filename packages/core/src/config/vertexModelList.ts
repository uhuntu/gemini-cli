/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleAuth } from 'google-auth-library';

export interface VertexModelOption {
  value: string;
  title: string;
  key: string;
}

interface PublisherModel {
  name?: string;
  displayName?: string;
}

interface PublisherModelPage {
  publisherModels?: PublisherModel[];
  nextPageToken?: string;
}

// Validates the untrusted JSON response instead of asserting its shape.
function parsePublisherModelPage(value: unknown): PublisherModelPage {
  if (typeof value !== 'object' || value === null) {
    return {};
  }
  const page: PublisherModelPage = {};
  if ('nextPageToken' in value && typeof value.nextPageToken === 'string') {
    page.nextPageToken = value.nextPageToken;
  }
  if ('publisherModels' in value && Array.isArray(value.publisherModels)) {
    page.publisherModels = value.publisherModels.filter(
      (m: unknown): m is PublisherModel => typeof m === 'object' && m !== null,
    );
  }
  return page;
}

const PUBLISHER_MODELS_URL =
  'https://aiplatform.googleapis.com/v1beta1/publishers/google/models';

// Models that do not generate text through generateContent.
const NON_TEXT_MODEL_PATTERN =
  /(embedding|imagen|image|veo|lyria|tts|live|transcribe|translate|audio|nano-banana|omni)/i;

/**
 * Lists Gemini text models published by Google on Vertex AI, authenticated
 * with Application Default Credentials. Returns an empty list on any failure
 * so callers can fall back to the built-in model list.
 */
export async function fetchVertexGeminiModels(
  signal?: AbortSignal,
): Promise<VertexModelOption[]> {
  const project =
    process.env['GOOGLE_CLOUD_PROJECT'] ||
    process.env['GOOGLE_CLOUD_PROJECT_ID'];
  try {
    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    const token = await auth.getAccessToken();
    if (!token) {
      return [];
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };
    if (project) {
      headers['x-goog-user-project'] = project;
    }

    const results: VertexModelOption[] = [];
    let pageToken: string | undefined;

    do {
      const url = new URL(PUBLISHER_MODELS_URL);
      url.searchParams.set('pageSize', '200');
      if (pageToken) {
        url.searchParams.set('pageToken', pageToken);
      }

      const res = await fetch(url.toString(), { headers, signal });
      if (!res.ok) {
        break;
      }

      const data = parsePublisherModelPage(await res.json());

      for (const m of data.publisherModels ?? []) {
        const id = (m.name ?? '').replace(/^publishers\/google\/models\//, '');
        if (!id.startsWith('gemini-') || NON_TEXT_MODEL_PATTERN.test(id)) {
          continue;
        }
        results.push({
          value: id,
          title: m.displayName ? `${id} (${m.displayName})` : id,
          key: id,
        });
      }

      pageToken = data.nextPageToken;
    } while (pageToken);

    return results;
  } catch {
    return [];
  }
}
