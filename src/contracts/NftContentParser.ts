import { Cell, Dictionary } from "@ton/core";
import { sha256_sync } from "@ton/crypto";
import { NFTDictValueSerializer } from "./dict";

export type ProfileData = {
  login: string;
  imageUrl?: string;
  firstName?: string;
  lastName?: string;
  tgUsername?: string;
};

const toLower = (value?: string): string | undefined =>
  value && value.trim().length > 0 ? value.trim().toLowerCase() : undefined;

const sanitizeLogin = (value?: string): string | undefined => {
  if (!value) {
    return undefined;
  }

  // Drop non-printable characters and trim.
  const cleaned = value
    .split("")
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code >= 32 && code <= 126;
    })
    .join("")
    .trim()
    .toLowerCase();

  return cleaned.length > 0 ? cleaned : undefined;
};

const capitalize = (value?: string): string | undefined => {
  if (!value || value.trim().length === 0) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
};

const extractAttributes = (raw?: string) => {
  if (!raw) {
    return { firstName: undefined, lastName: undefined, tgUsername: undefined, login: undefined };
  }

  try {
    const attrs = JSON.parse(raw);
    if (!Array.isArray(attrs)) {
      return { firstName: undefined, lastName: undefined, tgUsername: undefined, login: undefined };
    }
    const getValue = (trait: string) =>
      attrs.find((a: { trait_type?: string }) => a && a.trait_type === trait)?.value as
        | string
        | undefined;
    return {
      firstName: getValue("firstName"),
      lastName: getValue("lastName"),
      tgUsername: getValue("tgUsername"),
      login: getValue("login"),
    };
  } catch {
    return { firstName: undefined, lastName: undefined, tgUsername: undefined, login: undefined };
  }
};

export const parseProfileFromNftContent = (
  content: Cell | null,
): ProfileData | null => {
  if (!content) {
    return null;
  }

  let dictResult: Record<string, string | undefined> = {};

  try {
    const slice = content.beginParse();
    const start = slice.loadUint(8);
    if (start !== 0) {
      throw new Error("Unknown on-chain content format");
    }

    const dict = slice.loadDict(Dictionary.Keys.Buffer(32), NFTDictValueSerializer);

    const keys = ["image", "name", "description", "attributes"];
    for (const key of keys) {
      const dictKey = sha256_sync(key);
      const dictValue = dict.get(dictKey);
      if (dictValue) {
        dictResult[key] = dictValue.content.toString("utf-8");
      }
    }
  } catch (error) {
    console.error("getProfile error:", error);
    return null;
  }

  const fields = dictResult;

  const { firstName, lastName, tgUsername, login: attrLogin } = extractAttributes(fields.attributes);

  const normalizedImageUrl =
    toLower(fields.image) && toLower(fields.image) !== ""
      ? toLower(fields.image)
      : "https://cryptostylematrix.github.io/frontend/cs-big.png";
  const normalizedFirstName = capitalize(firstName);
  const normalizedLastName = capitalize(lastName);
  const normalizedTgUsername = toLower(tgUsername);
  const normalizedLogin = sanitizeLogin(attrLogin ?? fields.name) ?? "unknown";

  return {
    login: normalizedLogin,
    imageUrl: normalizedImageUrl,
    firstName: normalizedFirstName,
    lastName: normalizedLastName,
    tgUsername: normalizedTgUsername,
  };
};
