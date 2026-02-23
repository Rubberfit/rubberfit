// Script to seed test cuts data for demonstration
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables');
  console.error('NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl);
  console.error('NEXT_PUBLIC_SUPABASE_ANON_KEY:', supabaseAnonKey ? 'Set' : 'Missing');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function seedTestCuts() {
  console.log('Starting to seed test cuts...');

  try {
    // First, get some rolls to create cuts from
    const { data: rolls, error: rollsError } = await supabase
      .from('rolls')
      .select('*')
      .eq('status', 'active')
      .limit(10);

    if (rollsError) {
      console.error('Error fetching rolls:', rollsError);
      return;
    }

    if (!rolls || rolls.length === 0) {
      console.log('No active rolls found. Please add some rolls first.');
      return;
    }

    console.log(`Found ${rolls.length} rolls to create cuts from`);

    // Create test cuts for the past 3 months
    const cuts = [];
    const now = new Date();

    for (let daysAgo = 0; daysAgo < 90; daysAgo += Math.floor(Math.random() * 3) + 1) {
      const roll = rolls[Math.floor(Math.random() * rolls.length)];
      const cutDate = new Date(now);
      cutDate.setDate(cutDate.getDate() - daysAgo);

      // Random cut dimensions (smaller than roll width)
      const cutWidth = Math.floor(Math.random() * (roll.width * 0.8)) + 6;
      const cutLength = Math.floor(Math.random() * 48) + 12;
      const quantity = Math.floor(Math.random() * 3) + 1;

      const totalLengthNeeded = cutLength * quantity;
      const materialUsedSqft = (cutWidth * totalLengthNeeded) / 144;
      const totalConsumedSqft = (roll.width * totalLengthNeeded) / 144;
      const wasteSqft = totalConsumedSqft - materialUsedSqft;
      const wastePercentage = (wasteSqft / totalConsumedSqft) * 100;

      cuts.push({
        roll_id: roll.id,
        cut_width: cutWidth,
        cut_length: cutLength,
        quantity: quantity,
        waste_sqft: wasteSqft,
        waste_percentage: wastePercentage,
        total_sqft_used: materialUsedSqft,
        job_reference: `TEST-${Math.floor(Math.random() * 10000)}`,
        cut_by: 'Test User',
        notes: 'Test cut for demonstration',
        created_at: cutDate.toISOString()
      });
    }

    console.log(`Creating ${cuts.length} test cuts...`);

    // Insert cuts in batches
    const batchSize = 10;
    for (let i = 0; i < cuts.length; i += batchSize) {
      const batch = cuts.slice(i, i + batchSize);
      const { error: insertError } = await supabase
        .from('cuts')
        .insert(batch);

      if (insertError) {
        console.error('Error inserting cuts batch:', insertError);
      } else {
        console.log(`Inserted batch ${Math.floor(i / batchSize) + 1}`);
      }
    }

    console.log('Successfully seeded test cuts!');

    // Update roll remaining lengths
    for (const roll of rolls) {
      const { data: rollCuts } = await supabase
        .from('cuts')
        .select('cut_length, quantity')
        .eq('roll_id', roll.id);

      if (rollCuts) {
        const totalLengthUsed = rollCuts.reduce((sum, cut) =>
          sum + (cut.cut_length * cut.quantity), 0
        );

        const newRemainingLength = Math.max(0, roll.remaining_length - totalLengthUsed);

        await supabase
          .from('rolls')
          .update({
            remaining_length: newRemainingLength,
            status: newRemainingLength <= 0 ? 'depleted' : 'active'
          })
          .eq('id', roll.id);
      }
    }

    console.log('Updated roll remaining lengths');

  } catch (error) {
    console.error('Error seeding cuts:', error);
  }
}

// Run the seed function
seedTestCuts();