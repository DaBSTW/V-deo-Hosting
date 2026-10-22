import { z } from "zod";
import { requireApiUser } from "#srv/auth/session";
import { HttpError, handler, json, methods, readJson } from "#srv/http";
import { prisma } from "#srv/prisma";
import { rateLimit } from "#srv/rate-limit";
import { getUserPremium, syncSubscription } from "#srv/premium/service";
import { premiumCookieHeader } from "#srv/premium/token";

const schema = z.object({ subscriptionId: z.string().min(3).max(64).optional() });

/**
 * POST /api/premium/sync — al volver de PayPal (o con «Actualizar estado»):
 * lee la suscripción en PayPal y renueva el pase Premium de la cookie.
 */
const POST = handler(async (req) => {
  const user = await requireApiUser();
  rateLimit(`premium-sync:${user.id}`, 20, 10 * 60_000);
  const { subscriptionId } = schema.parse(await readJson(req));
  const sub = await prisma.subscription.findFirst({
    where: subscriptionId ? { userId: user.id, providerSubscriptionId: subscriptionId } : { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
  if (!sub) throw new HttpError(404, "subscriptionNotFound");
  const { premiumUntil } = await syncSubscription(sub.providerSubscriptionId);
  const res = json(await getUserPremium(user.id));
  res.headers.append("Set-Cookie", premiumCookieHeader(user.id, premiumUntil));
  return res;
});

export default methods({ POST });
