// Based on edge-tts-universal by Travis (AGPL-3.0-or-later).
// Original: https://github.com/travisvn/edge-tts-universal
// EnglishJourney modification: Microsoft endpoint migration and bounded WebSocket waits.
import { TRUSTED_CLIENT_TOKEN } from './constants.ts';
import { generateSecMsGec as generateSecMsGecV2 } from './sec-ms-gec-v2.ts';
import { SkewAdjustmentError } from "./exceptions.ts";

const WIN_EPOCH = 11644473600;
const S_TO_NS = 1e9;

/**
 * Isomorphic DRM class that works in both Node.js and browsers.
 * Uses appropriate crypto APIs based on the environment.
 */
export class IsomorphicDRM {
  private static clockSkewSeconds = 0.0;

  static adjClockSkewSeconds(skewSeconds: number) {
    IsomorphicDRM.clockSkewSeconds += skewSeconds;
  }

  static getUnixTimestamp(): number {
    return Date.now() / 1000 + IsomorphicDRM.clockSkewSeconds;
  }

  static parseRfc2616Date(date: string): number | null {
    try {
      return new Date(date).getTime() / 1000;
    } catch (e) {
      return null;
    }
  }

  static handleClientResponseError(response: { status: number; headers: any }) {
    let serverDate: string | null = null;

    if ('headers' in response && typeof response.headers === 'object') {
      if ('get' in response.headers && typeof response.headers.get === 'function') {
        // Fetch Response object
        serverDate = response.headers.get("date");
      } else {
        // Plain object with headers
        const headers = response.headers as Record<string, string>;
        serverDate = headers["date"] || headers["Date"];
      }
    }

    if (!serverDate) {
      throw new SkewAdjustmentError("No server date in headers.");
    }
    const serverDateParsed = IsomorphicDRM.parseRfc2616Date(serverDate);
    if (serverDateParsed === null) {
      throw new SkewAdjustmentError(`Failed to parse server date: ${serverDate}`);
    }
    const clientDate = IsomorphicDRM.getUnixTimestamp();
    IsomorphicDRM.adjClockSkewSeconds(serverDateParsed - clientDate);
  }

  static async generateSecMsGec(): Promise<string> {
    return generateSecMsGecV2(TRUSTED_CLIENT_TOKEN, IsomorphicDRM.getUnixTimestamp());
  }

  /**
   * Generates a random MUID (Machine Unique Identifier).
   * @returns Uppercase 32-character hex string
   */
  static generateMuid(): string {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  }

  /**
   * Returns a copy of the given headers with a MUID cookie added.
   * @param headers - The original headers
   * @returns New headers object with Cookie header containing the MUID
   */
  static headersWithMuid(headers: Record<string, string>): Record<string, string> {
    return {
      ...headers,
      Cookie: `muid=${IsomorphicDRM.generateMuid()};`,
    };
  }
} 