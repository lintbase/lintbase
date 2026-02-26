// app/api/stripe/webhook/route.ts
// Handles Stripe events to keep user plan in sync with subscription status.
//
// Events handled:
//   checkout.session.completed  → mark user as pro
//   customer.subscription.deleted → downgrade to free
//   customer.subscription.updated → sync status (handles failed payments)

import Stripe from 'stripe';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '../../../../lib/firebase-admin';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2026-02-25.clover',
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(req: NextRequest) {
    const body = await req.text();
    const signature = req.headers.get('stripe-signature');

    if (!signature) {
        return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
    }

    let event: Stripe.Event;
    try {
        event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
        console.error('[Stripe webhook] Invalid signature:', err);
        return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    const db = getAdminDb();

    try {
        switch (event.type) {

            // ── New subscription created ──────────────────────────────────────
            case 'checkout.session.completed': {
                const session = event.data.object as Stripe.Checkout.Session;
                const userId = session.metadata?.userId;
                if (!userId) break;

                await db.collection('users').doc(userId).update({
                    plan: 'pro',
                    stripeCustomerId: session.customer,
                    stripeSubscriptionId: session.subscription,
                    upgradedAt: new Date(),
                });
                console.log(`[Stripe] User ${userId} upgraded to Pro`);
                break;
            }

            // ── Subscription cancelled ────────────────────────────────────────
            case 'customer.subscription.deleted': {
                const sub = event.data.object as Stripe.Subscription;
                const users = await db.collection('users')
                    .where('stripeCustomerId', '==', sub.customer)
                    .limit(1)
                    .get();

                for (const doc of users.docs) {
                    await doc.ref.update({
                        plan: 'free',
                        stripeSubscriptionId: null,
                        downgradedAt: new Date(),
                    });
                    console.log(`[Stripe] User ${doc.id} downgraded to free`);
                }
                break;
            }

            // ── Payment failed / subscription paused ─────────────────────────
            case 'customer.subscription.updated': {
                const sub = event.data.object as Stripe.Subscription;
                const status = sub.status;

                // Only downgrade on payment failure states
                if (status === 'past_due' || status === 'unpaid' || status === 'canceled') {
                    const users = await db.collection('users')
                        .where('stripeCustomerId', '==', sub.customer)
                        .limit(1)
                        .get();

                    for (const doc of users.docs) {
                        await doc.ref.update({ plan: 'free' });
                        console.log(`[Stripe] User ${doc.id} downgraded — subscription ${status}`);
                    }
                }
                break;
            }

            default:
                // Ignore all other events
                break;
        }

    } catch (err) {
        console.error(`[Stripe webhook] Error handling ${event.type}:`, err);
        return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
    }

    return NextResponse.json({ received: true });
}

// Disable body parsing — webhook verification requires raw body
export const dynamic = 'force-dynamic';
