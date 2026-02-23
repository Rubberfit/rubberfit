// Script to check roll status and restore active rolls if needed
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkAndRestoreRolls() {
  console.log('Checking roll inventory status...\n');

  try {
    // Check current roll status
    const { data: rolls, error } = await supabase
      .from('rolls')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching rolls:', error);
      return;
    }

    console.log(`Total rolls in database: ${rolls?.length || 0}`);

    const activeRolls = rolls?.filter(r => r.status === 'active') || [];
    const depletedRolls = rolls?.filter(r => r.status === 'depleted') || [];

    console.log(`Active rolls: ${activeRolls.length}`);
    console.log(`Depleted rolls: ${depletedRolls.length}`);

    if (activeRolls.length === 0) {
      console.log('\n⚠️  No active rolls found! The inventory shows 0 because all rolls are depleted.');
      console.log('This happened because the seed script created cuts that used up the remaining material.\n');

      // Option 1: Restore some depleted rolls (simulate receiving new stock)
      if (depletedRolls.length > 0) {
        console.log('Restoring some rolls to active status (simulating new stock delivery)...\n');

        // Take the first 3 depleted rolls and restore them
        const rollsToRestore = depletedRolls.slice(0, Math.min(3, depletedRolls.length));

        for (const roll of rollsToRestore) {
          const { error: updateError } = await supabase
            .from('rolls')
            .update({
              status: 'active',
              remaining_length: roll.length, // Reset to original length
              date_received: new Date().toISOString().split('T')[0] // Update received date
            })
            .eq('id', roll.id);

          if (updateError) {
            console.error(`Error restoring roll ${roll.id}:`, updateError);
          } else {
            console.log(`✅ Restored roll: ${roll.material_type} ${roll.width}" × ${roll.length}" - Location: ${roll.location}`);
          }
        }
      }

      // Option 2: Add some new rolls
      console.log('\nAdding new rolls to inventory...\n');

      const newRolls = [
        {
          material_type: 'Neoprene',
          width: 48,
          length: 600,
          thickness: 0.25,
          color: 'Black',
          location: 'Rack A1',
          supplier: 'Industrial Supply Co',
          cost_per_sqft: 2.50,
          remaining_length: 600,
          status: 'active'
        },
        {
          material_type: 'EPDM',
          width: 36,
          length: 500,
          thickness: 0.125,
          color: 'Gray',
          location: 'Rack B2',
          supplier: 'Rubber Direct',
          cost_per_sqft: 3.00,
          remaining_length: 500,
          status: 'active'
        },
        {
          material_type: 'Silicone',
          width: 24,
          length: 300,
          thickness: 0.1875,
          color: 'Red',
          location: 'Rack C3',
          supplier: 'Premium Materials Inc',
          cost_per_sqft: 5.00,
          remaining_length: 300,
          status: 'active'
        }
      ];

      const { error: insertError } = await supabase
        .from('rolls')
        .insert(newRolls);

      if (insertError) {
        console.error('Error adding new rolls:', insertError);
      } else {
        console.log('✅ Added 3 new rolls to inventory');
      }
    } else {
      console.log('\n✅ Inventory has active rolls. Dashboard should show correct counts.');
      console.log('\nActive roll details:');
      activeRolls.forEach(roll => {
        const sqft = (roll.remaining_length * roll.width) / 144;
        console.log(`- ${roll.material_type}: ${roll.width}" × ${roll.remaining_length}" remaining (${sqft.toFixed(1)} sqft) at ${roll.location}`);
      });
    }

    // Show inventory value calculation
    const totalValue = activeRolls.reduce((sum, roll) => {
      const sqft = (roll.remaining_length * roll.width) / 144;
      return sum + (sqft * (roll.cost_per_sqft || 2.5));
    }, 0);

    console.log(`\n💰 Total inventory value: $${totalValue.toFixed(2)}`);

  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the check
checkAndRestoreRolls();