// app/api/stripe/checkout/route.ts
// Creates a Stripe Checkout session for the Pro subscription.
// Called by the settings page when the user clicks "Upgrade to Pro".

import Stripe from 'stripe';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '../../../../lib/firebase-admin';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2026-02-25.clover',
});

export async function POST(req: NextRequest) {
    try {
        const { userId, email } = await req.json() as { userId: string; email: string };

        if (!userId || !email) {
            return NextResponse.json({ error: 'Missing userId or email' }, { status: 400 });
        }

        // Check if user already has a Stripe customer ID (re-subscriptions)
        const db = getAdminDb();
        const userDoc = await db.collection('users').doc(userId).get();
        const userData = userDoc.data() as { stripeCustomerId?: string } | undefined;

        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.lintbase.com';

        const sessionParams: Stripe.Checkout.SessionCreateParams = {
            mode: 'subscription',
            payment_method_types: ['card'],
            line_items: [
                {
                    price: process.env.STRIPE_PRO_PRICE_ID!,
                    quantity: 1,
                },
            ],
            success_url: `${appUrl}/dashboard/settings?success=true`,
            cancel_url: `${appUrl}/dashboard/settings?canceled=true`,
            metadata: { userId },
            // Reuse existing Stripe customer if available
            ...(userData?.stripeCustomerId
                ? { customer: userData.stripeCustomerId }
                : { customer_email: email }),
        };

        const session = await stripe.checkout.sessions.create(sessionParams);

        return NextResponse.json({ url: session.url });

    } catch (err) {
        console.error('[POST /api/stripe/checkout]', err);
        return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 });
    }
}
