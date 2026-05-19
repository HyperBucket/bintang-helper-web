import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://bqlcqpnffvdqsberqoiz.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxbGNxcG5mZnZkcXNiZXJxb2l6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxNDU4NzUsImV4cCI6MjA5NDcyMTg3NX0.iGLZv89hrRfHK2MSVvkQ2v8-anntqFEjaCKWaQbIf8Q'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
