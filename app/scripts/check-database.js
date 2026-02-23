const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkDatabase() {
  console.log('🔍 Checking Supabase Database Schema...\n');

  // Check if we can connect at all
  const { data: test, error: testError } = await supabase
    .from('_any_table_name_')
    .select('*')
    .limit(1);

  if (testError) {
    console.log('Connection test error:', testError.message);
    console.log('\n📋 This likely means:');

    if (testError.message.includes('schema cache')) {
      console.log('   ✅ Connected to Supabase successfully');
      console.log('   ❌ But the tables don\'t exist yet');
      console.log('\n💡 Solution: The migrations need to be RUN, not just pushed.');
      console.log('   When you "push" migrations, they\'re uploaded but not executed.');
      console.log('   You need to run them through:');
      console.log('   1. Supabase Dashboard SQL Editor');
      console.log('   2. OR using: npx supabase migration up (if you have CLI setup)');
    } else if (testError.message.includes('JWT')) {
      console.log('   ❌ Authentication issue with your API key');
    } else {
      console.log('   ❌ Unknown connection issue');
    }
  }

  // Try to get table information from a different angle
  console.log('\n📊 Attempting to query information_schema...');
  const { data: tables, error: schemaError } = await supabase
    .rpc('get_tables_info', {});

  if (schemaError) {
    console.log('   Cannot query schema info (this is normal with anon key)');
  } else if (tables) {
    console.log('   Found tables:', tables);
  }

  console.log('\n📝 Summary:');
  console.log('   Project URL:', supabaseUrl);
  console.log('   Using anon key:', supabaseAnonKey.substring(0, 20) + '...');
  console.log('\n🎯 Next steps:');
  console.log('   1. Go to your Supabase Dashboard');
  console.log('   2. Navigate to the SQL Editor');
  console.log('   3. Check if tables exist in Table Editor');
  console.log('   4. If not, run the migrations in SQL Editor');
}

checkDatabase();