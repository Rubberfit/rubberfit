-- Create cut_history table for tracking cut operations
CREATE TABLE IF NOT EXISTS cut_history (
  -- User ID
  id                      SERIAL PRIMARY KEY,
  user_id                 UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Material and cut details
  material_id             INT NOT NULL,
  part_id                 INT NOT NULL,

  --Cut dimensions
  cut_length              FLOAT NOT NULL,
  cut_width               FLOAT NOT NULL,
  cut_thickness           FLOAT NOT NULL,
  
  --Custom part sizes selected by the user (if applicable)
  part_custom_width       FLOAT NULL,
  part_custom_height      FLOAT NULL,
  
  --Size selections
  part_selected_size      INTEGER[],
  part_selected_size_text TEXT[],
  part_selected_label     TEXT[],

  --Amount of matierial cut
  cut_amount              INT NOT NULL,

  --Miscellaneous details
  parts_completed          INT NOT NULL,
  mat_used                 FLOAT NOT NULL,
  reusable_offcuts         FLOAT NOT NULL,
  waste_percentage         FLOAT NOT NULL,
  fab_score                FLOAT NOT NULL,
  cut_pieces               INT NOT NULL,

  --Timestamps
  cut_date                TIMESTAMPTZ DEFAULT NOW(),
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT positive_cut_length CHECK (cut_length > 0),  
  CONSTRAINT positive_cut_width CHECK (cut_width > 0),
  CONSTRAINT positive_cut_thickness CHECK (cut_thickness > 0),
  CONSTRAINT non_negative_custom_width  CHECK (part_custom_width IS NULL OR part_custom_width >= 0),
  CONSTRAINT non_negative_custom_height CHECK (part_custom_height IS NULL OR part_custom_height >= 0)

 
);
-- Enable Row Level Security
ALTER TABLE cut_history ENABLE ROW LEVEL SECURITY;


 
-- Comments
COMMENT ON TABLE cut_history IS 'Table to track cut operations performed by users, including material, length, date, and user information.';
COMMENT ON COLUMN cut_history.material_id IS 'Foreign key referencing the dimension material size.';
COMMENT ON COLUMN cut_history.part_id IS 'Foreign key referencing the part shape that was cut.';
COMMENT ON COLUMN cut_history.cut_length IS 'The length of the cut piece.';
COMMENT ON COLUMN cut_history.cut_width IS 'The width of the cut piece.';
COMMENT ON COLUMN cut_history.cut_thickness IS 'The thickness of the cut piece.';
COMMENT ON COLUMN cut_history.part_custom_width IS 'Custom width specified by the user for the part, if applicable.';
COMMENT ON COLUMN cut_history.part_custom_height IS 'Custom height specified by the user for the part, if applicable.';
COMMENT ON COLUMN cut_history.part_selected_size IS 'Array of selected size IDs for the part, if applicable.';
COMMENT ON COLUMN cut_history.part_selected_size_text IS 'Array of selected size descriptions for the part, if applicable.';
COMMENT ON COLUMN cut_history.part_selected_label IS 'Array of selected size labels for the part, if applicable.';
COMMENT ON COLUMN cut_history.cut_amount IS 'The amount of material cut in this operation.';