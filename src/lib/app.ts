import { ulid } from "ulid";
import { kv } from "@vercel/kv";

export type AppUser = {
  email: string;
  firstName: string;
  lastName: string;
};

export type AppGroup = {
  name: string;
  memberEmails: string[];
};

export type App = {
  id: string;
  users: AppUser[];
  groups?: AppGroup[];
  spAcsUrl?: string;
  spEntityId?: string;
  autoSubmit?: boolean;
  scimBaseUrl?: string;
  scimBearerToken?: string;
};

export function appIdpEntityId(app: App): string {
  return `https://dummyidp.com/apps/${app.id}`;
}

export function appIdpRedirectUrl(app: App): string {
  return `https://${process.env.NEXT_PUBLIC_DUMMYIDP_CUSTOM_DOMAIN || process.env.VERCEL_URL}/apps/${app.id}/sso`;
}

export function appIdpMetadataUrl(app: App): string {
  return `https://${process.env.NEXT_PUBLIC_DUMMYIDP_CUSTOM_DOMAIN || process.env.VERCEL_URL}/apps/${app.id}/metadata`;
}

export function appLoginUrl(app: App): string {
  return `https://${process.env.NEXT_PUBLIC_DUMMYIDP_CUSTOM_DOMAIN || process.env.VERCEL_URL}/apps/${app.id}/login`;
}

export async function createApp(): Promise<string> {
  const id = `app_${ulid().toLowerCase()}`;
  await kv.hset(id, {
    id,
    groups: [],
    users: [
      { email: "john.doe@example.com", firstName: "John", lastName: "Doe" },
      {
        email: "abraham.lincoln@example.com",
        firstName: "Abraham",
        lastName: "Lincoln",
      },
    ],
  });
  return id;
}

export async function getApp(id: string): Promise<App | undefined> {
  const result = await kv.hgetall(id);
  if (!result) {
    return undefined;
  }

  return result as unknown as App;
}

export async function upsertApp(app: App): Promise<void> {
  // get a list of users being deleted, so we can SCIM DELETE them later
  const oldApp = (await kv.hgetall(app.id)) as App | undefined;
  const deletedUserEmails: string[] = [];
  if (oldApp) {
    // could do this with sets, but NextJS doesn't seem to support
    // set.difference, so there's very little gain
    for (const oldUser of oldApp.users) {
      let found = false;
      for (const newUser of app.users) {
        if (newUser.email === oldUser.email) {
          found = true;
        }
      }

      if (!found) {
        deletedUserEmails.push(oldUser.email);
      }
    }
  }

  const deletedGroupNames: string[] = [];
  if (oldApp?.groups) {
    for (const oldGroup of oldApp.groups) {
      if (!(app.groups ?? []).find(g => g.name === oldGroup.name)) {
        deletedGroupNames.push(oldGroup.name);
      }
    }
  }

  // update the app
  await kv.hset(app.id, app);

  // scim sync
  if (app.scimBaseUrl && app.scimBearerToken) {
    // Carry out a scim sync; our approach is stateless and is close to Okta's
    // syncing approach.
    //
    // For each user, list users filtered by email address. If we get a result,
    // PUT against the resulting user ID. If we don't get a result, POST a new
    // user. Do not persist state about assigned user IDs between syncs.
    for (const user of app.users) {
      const userId = await scimUserByEmail(app, user.email);
      const scimUser = {
        schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
        userName: user.email,
        name: {
          givenName: user.firstName,
          familyName: user.lastName,
        },
        emails: [{ value: user.email, primary: true, type: "work" }],
        active: true,
      };
      if (userId) {
        const res = await fetch(`${app.scimBaseUrl}/Users/${userId}`, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${app.scimBearerToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(scimUser),
        });
        if (!res.ok) {
          console.error(`SCIM PUT /Users/${userId} failed: ${res.status}`, await res.text());
        }
      } else {
        const res = await fetch(`${app.scimBaseUrl}/Users`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${app.scimBearerToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(scimUser),
        });
        if (!res.ok) {
          console.error(`SCIM POST /Users failed: ${res.status}`, await res.text());
        }
      }
    }

    // delete removed users
    for (const email of deletedUserEmails) {
      const userId = await scimUserByEmail(app, email);
      if (userId) {
        const res = await fetch(`${app.scimBaseUrl}/Users/${userId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${app.scimBearerToken}` },
        });
        if (!res.ok) {
          console.error(`SCIM DELETE /Users/${userId} failed: ${res.status}`, await res.text());
        }
      }
    }

    // sync groups
    for (const group of app.groups ?? []) {
      const groupId = await scimGroupByName(app, group.name);

      // resolve member SCIM user IDs; users were synced above so IDs should exist,
      // but resolution is best-effort — some SCIM servers may not return new users immediately
      const members: { value: string; display: string }[] = [];
      for (const email of group.memberEmails) {
        const userId = await scimUserByEmail(app, email);
        if (userId) {
          members.push({ value: userId, display: email });
        }
      }

      const scimGroup = {
        schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
        displayName: group.name,
        members,
      };

      if (groupId) {
        const res = await fetch(`${app.scimBaseUrl}/Groups/${groupId}`, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${app.scimBearerToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(scimGroup),
        });
        if (!res.ok) {
          console.error(
            `SCIM PUT /Groups/${groupId} failed: ${res.status}`,
            await res.text(),
          );
        }
      } else {
        const res = await fetch(`${app.scimBaseUrl}/Groups`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${app.scimBearerToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(scimGroup),
        });
        if (!res.ok) {
          console.error(
            `SCIM POST /Groups failed: ${res.status}`,
            await res.text(),
          );
        }
      }
    }

    // delete removed groups
    for (const name of deletedGroupNames) {
      const groupId = await scimGroupByName(app, name);
      if (groupId) {
        const res = await fetch(`${app.scimBaseUrl}/Groups/${groupId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${app.scimBearerToken}` },
        });
        if (!res.ok) {
          console.error(
            `SCIM DELETE /Groups/${groupId} failed: ${res.status}`,
            await res.text(),
          );
        }
      }
    }
  }
}

async function scimGroupByName(
  app: App,
  name: string,
): Promise<string | undefined> {
  const filter = new URLSearchParams({
    filter: `displayName eq "${name.replace(/"/g, '\\"')}"`,
  });

  const listResponse = await fetch(`${app.scimBaseUrl}/Groups?${filter}`, {
    headers: { Authorization: `Bearer ${app.scimBearerToken}` },
  });
  if (!listResponse.ok) {
    console.error(
      `SCIM GET /Groups?filter=... failed: ${listResponse.status}`,
      await listResponse.text(),
    );
    return undefined;
  }
  const listBody = await listResponse.json();
  const resources = listBody?.resources ?? listBody?.Resources ?? [];
  if (resources.length > 0) {
    return resources[0].id;
  }
  return undefined;
}

async function scimUserByEmail(
  app: App,
  email: string,
): Promise<string | undefined> {
  const filter = new URLSearchParams({
    filter: `userName eq "${email}"`,
  });

  const listResponse = await fetch(`${app.scimBaseUrl}/Users?${filter}`, {
    headers: { Authorization: `Bearer ${app.scimBearerToken}` },
  });
  if (!listResponse.ok) {
    console.error(`SCIM GET /Users?filter=... failed: ${listResponse.status}`, await listResponse.text());
    return undefined;
  }
  const listBody = await listResponse.json();

  // in practice, SCIM servers put the results into either `resources` or
  // `Resources`
  const resources = listBody?.resources ?? listBody?.Resources ?? []
  if (resources.length > 0) {
    return resources[0].id;
  }
  return undefined;
}
