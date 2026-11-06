const equals = (a, b) => typeof a === "string" && a.toLowerCase() === b.toLowerCase();
const part = encodeURIComponent;
const missing = { status: "sin_resultado" };
const unclear = { status: "indeterminado" };

const AVATAR_PATHS = {
  "avatars.githubusercontent.com": /^\/u\/\d+$/,
  "gravatar.com": /^\/avatar\/[a-f0-9]{32,64}(?:\.[a-z]+)?$/i,
  "secure.gravatar.com": /^\/avatar\/[a-f0-9]{32,64}(?:\.[a-z]+)?$/i,
  "www.gravatar.com": /^\/avatar\/[a-f0-9]{32,64}(?:\.[a-z]+)?$/i,
  "cdn.bsky.app": /^\/img\/avatar(?:_thumbnail)?\/plain\/did:[a-z0-9:._%-]+\/[a-z0-9]+@[a-z]+$/i,
  "gitlab.com": /^\/uploads\/-\/system\/user\/avatar\/\d+\/[a-z0-9._%+-]+$/i
};
export const avatarOrigins = Object.keys(AVATAR_PATHS).map(host => `https://${host}`);

export function publicAvatar(value) {
  try {
    if (typeof value !== "string" || value.length > 300) return undefined;
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port ||
        !Object.hasOwn(AVATAR_PATHS, url.hostname) || !AVATAR_PATHS[url.hostname].test(url.pathname)) return undefined;
    return url.origin + url.pathname;
  } catch {
    return undefined;
  }
}

function profile(expected, actual, url, name, detail = "Perfil público con el alias consultado.") {
  if (!equals(actual, expected)) return unclear;
  return { status: "verificado", url, name: typeof name === "string" ? name.slice(0, 120) : undefined, detail };
}

function query(url, parameters) {
  return url + "?" + new URLSearchParams(parameters);
}

export function publicProfileChecks(alias, upstream, email) {
  const safe = part(alias);
  const checks = [];
  const add = (source, url, parse, options) => {
    checks.push([source, async () => {
      const { data, status } = await upstream(url, "application/json", options);
      return status ? { status } : parse(data);
    }]);
  };

  add("Stack Overflow · nombre visible", query("https://api.stackexchange.com/2.3/users", {
    site: "stackoverflow", inname: alias, pagesize: "20"
  }), data => {
    if (data?.error_name === "throttle_violation") return { status: "limitado" };
    if (!Array.isArray(data?.items)) return unclear;
    const links = data.items
      .filter(user => equals(user?.display_name, alias) && Number.isSafeInteger(user.user_id) && user.user_id > 0)
      .slice(0, 5)
      .map(user => `https://stackoverflow.com/users/${user.user_id}`);
    if (links.length) return {
      status: "indicio", profileLinks: [...new Set(links)],
      detail: "Coincidencia exacta en el nombre visible de un perfil público. Stack Overflow permite nombres repetidos."
    };
    return data.has_more === false ? missing : unclear;
  });

  if (/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(alias)) {
    const host = alias.toLowerCase() + ".wordpress.com";
    add("WordPress.com · sitio público", query(`https://public-api.wordpress.com/rest/v1.1/sites/${host}`, {
      fields: "ID,URL,is_private"
    }), data => {
      if (data?.is_private !== false || !Number.isSafeInteger(data.ID) ||
          (data.URL !== `https://${host}` && data.URL !== `https://${host}/`)) return unclear;
      return { status: "verificado", url: `https://${host}/`, detail: "La API confirmó el sitio público en ese subdominio." };
    });
  }

  add("GitLab.com", query("https://gitlab.com/api/v4/users", { username: alias, per_page: "1" }), data => {
    if (!Array.isArray(data)) return unclear;
    if (!data.length) return missing;
    const result = profile(alias, data[0]?.username, `https://gitlab.com/${safe}`, data[0]?.name);
    if (result.status === "verificado") result.avatar = publicAvatar(data[0]?.avatar_url);
    if (result.status === "verificado" && email && equals(data[0]?.public_email, email)) {
      result.correlation = "El perfil de GitLab publica el mismo correo exacto ingresado.";
    }
    return result;
  });

  for (const [source, host] of [["Codeberg", "codeberg.org"], ["Gitea.com", "gitea.com"]]) {
    add(source, `https://${host}/api/v1/users/${safe}`, data => {
      if (data?.visibility && data.visibility !== "public") return unclear;
      return profile(alias, data?.login, `https://${host}/${safe}`, data?.full_name);
    });
  }

  const actor = alias.includes(".") ? alias.toLowerCase() : alias.toLowerCase() + ".bsky.social";
  if (/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z](?:[a-z0-9-]*[a-z0-9])?$/.test(actor)) {
    add("Bluesky", query("https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile", { actor }),
      data => {
        if (data?.error === "InvalidRequest" && data.message === "Profile not found") return missing;
        const result = profile(actor, data?.handle, `https://bsky.app/profile/${part(actor)}`, data?.displayName,
          `Perfil público del identificador completo ${actor}.`);
        if (result.status === "verificado") result.avatar = publicAvatar(data?.avatar);
        return result;
      }, { readBadRequest: true });
  }

  for (const host of ["mastodon.social", "mastodon.online", "fosstodon.org"]) {
    add(`Mastodon · ${host}`, query(`https://${host}/api/v1/accounts/lookup`, { acct: alias }),
      data => profile(alias, data?.acct, `https://${host}/@${safe}`, data?.display_name,
        "Cuenta pública de esta instancia de Mastodon."));
  }

  add("PeerTube · Framatube", `https://framatube.org/api/v1/accounts/${safe}`,
    data => data?.host === "framatube.org"
      ? profile(alias, data.name, `https://framatube.org/accounts/${safe}`, data.displayName, "Cuenta de esta instancia de PeerTube.")
      : unclear);

  add("Wikimedia", query("https://meta.wikimedia.org/w/api.php", {
    action: "query", meta: "globaluserinfo", guiuser: alias, format: "json", formatversion: "2"
  }), data => {
    const user = data?.query?.globaluserinfo;
    if (data?.error?.code === "nosuchuser" || user?.missing === true) return missing;
    if (!Number.isSafeInteger(user?.id)) return unclear;
    return profile(alias, user.name, `https://meta.wikimedia.org/wiki/Special:CentralAuth/${part(user.name)}`, undefined,
      "Cuenta global de Wikimedia. Puede usarse en varios proyectos.");
  });

  add("Lichess", `https://lichess.org/api/user/${safe}`,
    data => profile(alias, data?.username, `https://lichess.org/@/${safe}`));

  add("Chess.com", `https://api.chess.com/pub/player/${safe.toLowerCase()}`,
    data => profile(alias, data?.username, `https://www.chess.com/member/${safe.toLowerCase()}`, data?.name));

  add("Hugging Face", `https://huggingface.co/api/users/${safe}/overview`,
    data => profile(alias, data?.user, `https://huggingface.co/${safe}`, data?.fullname));

  add("Drupal.org", query("https://www.drupal.org/api-d7/user.json", { name: alias }), data => {
    if (!Array.isArray(data?.list)) return unclear;
    if (!data.list.length) return missing;
    const user = data.list.find(entry => equals(entry?.name, alias));
    return /^\d{1,12}$/.test(String(user?.uid))
      ? profile(alias, user.name, `https://www.drupal.org/u/${part(user.name.toLowerCase())}`) : unclear;
  });

  add("Codewars", `https://www.codewars.com/api/v1/users/${safe}`,
    data => profile(alias, data?.username, `https://www.codewars.com/users/${safe}`, data?.name));

  add("RubyGems.org", `https://rubygems.org/api/v1/profiles/${safe}.json`,
    data => profile(alias, data?.handle, `https://rubygems.org/profiles/${safe}`));

  add("crates.io", `https://crates.io/api/v1/users/${safe}`,
    data => profile(alias, data?.user?.login, `https://crates.io/users/${safe}`, data?.user?.name));

  add("Bitbucket · espacio de trabajo", `https://api.bitbucket.org/2.0/workspaces/${safe}`,
    data => data?.is_private === false
      ? profile(alias, data.slug, `https://bitbucket.org/${safe}/`, data.name,
        "Espacio de trabajo público. Puede pertenecer a una organización.")
      : unclear);

  add("Keybase", query("https://keybase.io/_/api/1.0/user/lookup.json", { username: alias, fields: "basics" }),
    data => data?.status?.code === 205 ? missing : data?.status?.code === 0
      ? profile(alias, (Array.isArray(data.them) ? data.them[0] : data.them)?.basics?.username, `https://keybase.io/${safe}`) : unclear);

  add("Roblox", "https://users.roblox.com/v1/usernames/users", data => {
    if (!Array.isArray(data?.data)) return unclear;
    if (!data.data.length) return missing;
    const user = data.data[0];
    return Number.isSafeInteger(user?.id) && user.id > 0
      ? profile(alias, user.name, `https://www.roblox.com/users/${user.id}/profile`) : unclear;
  }, { body: { usernames: [alias], excludeBannedUsers: true } });

  add("Minecraft · Java", `https://api.mojang.com/users/profiles/minecraft/${safe}`,
    data => data === null ? missing : /^[a-f0-9]{32}$/i.test(data?.id || "") && equals(data.name, alias)
      ? { status: "verificado", detail: "El directorio oficial devolvió un perfil de Minecraft Java con ese alias." }
      : unclear);
  return checks;
}

const PROFILE_PATHS = {
  "github.com": /^\/[\w.-]+$/,
  "gitlab.com": /^\/[\w.-]+$/,
  "codeberg.org": /^\/[\w.-]+$/,
  "gitea.com": /^\/[\w.-]+$/,
  "dev.to": /^\/[\w.-]+$/,
  "news.ycombinator.com": /^\/user$/,
  "bsky.app": /^\/profile\/[\w.-]+$/,
  "mastodon.social": /^\/@[\w.-]+$/,
  "mastodon.online": /^\/@[\w.-]+$/,
  "fosstodon.org": /^\/@[\w.-]+$/,
  "framatube.org": /^\/accounts\/[\w.-]+$/,
  "huggingface.co": /^\/[\w.-]+$/,
  "lichess.org": /^\/@\/[\w.-]+$/,
  "www.chess.com": /^\/member\/[\w.-]+$/,
  "www.codewars.com": /^\/users\/[\w.-]+$/,
  "rubygems.org": /^\/profiles\/[\w.-]+$/,
  "crates.io": /^\/users\/[\w.-]+$/,
  "bitbucket.org": /^\/[\w.-]+$/,
  "keybase.io": /^\/[\w.-]+$/,
  "www.roblox.com": /^\/users\/\d+\/profile$/,
  "facebook.com": /^\/[\w.]+$/,
  "www.facebook.com": /^\/[\w.]+$/,
  "www.reddit.com": /^\/(?:user|u)\/[\w-]+$/,
  "www.pinterest.com": /^\/[\w-]+$/,
  "www.threads.com": /^\/@[\w.]+$/,
  "t.me": /^\/[\w]+$/,
  "medium.com": /^\/@[\w.-]+$/,
  "substack.com": /^\/@[\w.-]+$/,
  "open.spotify.com": /^\/user\/[\w.-]+$/,
  "vimeo.com": /^\/[\w-]+$/,
  "www.linkedin.com": /^\/in\/[\w.-]+$/,
  "instagram.com": /^\/[\w.-]+$/,
  "x.com": /^\/[\w]+$/,
  "www.youtube.com": /^\/(?:@[\w.-]+|(?:channel|user|c)\/[\w.-]+)$/,
  "www.twitch.tv": /^\/[\w]+$/,
  "www.flickr.com": /^\/(?:photos|people)\/[\w.@-]+$/,
  "www.tiktok.com": /^\/@[\w.-]+$/
};

function publicLink(value) {
  try {
    if (typeof value !== "string" || value.length > 300) return "";
    const url = new URL(value);
    const path = url.pathname.replace(/\/$/, "");
    if (url.protocol !== "https:" || url.username || url.password || url.port ||
        !Object.hasOwn(PROFILE_PATHS, url.hostname) || !PROFILE_PATHS[url.hostname].test(path) ||
        path.split("/").includes("..")) return "";
    if (url.hostname === "news.ycombinator.com" && url.pathname === "/user") {
      const id = url.searchParams.get("id");
      if (!id || !/^[a-z0-9_-]{1,39}$/i.test(id)) return "";
      return `${url.origin}/user?id=${id}`;
    }
    url.hash = "";
    url.search = "";
    return url.href.replace(/\/$/, "");
  } catch {
    return "";
  }
}

export function declaredProfiles(accounts) {
  if (!Array.isArray(accounts)) return [];
  return [...new Set(accounts.filter(account => account?.is_hidden === false).map(account => publicLink(account.url)).filter(Boolean))].slice(0, 15);
}

export function markCorrelations(results) {
  const links = new Set(results.flatMap(result => result.declaredProfiles || []));
  const githubEmailLinks = new Set(results.find(result => result.source === "GitHub · correo del perfil público")?.profileLinks || []);
  for (const result of results) {
    if (result.source === "GitHub" && result.status === "verificado" && githubEmailLinks.has(result.url)) {
      result.correlation = "GitHub publica el correo exacto consultado en este perfil.";
    }
    if (result.kind === "alias" && result.status === "verificado" && !result.correlation && links.has(publicLink(result.url))) {
      result.correlation = "Este perfil coincide con un enlace que publica el perfil de Gravatar asociado al correo consultado.";
    }
  }
}
