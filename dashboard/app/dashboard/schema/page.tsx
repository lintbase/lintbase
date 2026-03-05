import { redirect } from 'next/navigation';

// Schema Map has moved to /dashboard (the main landing page after login)
export default function SchemaRedirect() {
    redirect('/dashboard');
}
