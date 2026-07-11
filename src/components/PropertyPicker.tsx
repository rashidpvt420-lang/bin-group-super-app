import React, { useState, useEffect } from 'react';
import { Autocomplete, TextField, CircularProgress } from '@mui/material';
import { collection, query, limit, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';

type PropertyPickerProps = {
  value?: string;
  onChange: (id: string, name?: string) => void;
  label?: string;
  error?: boolean;
  helperText?: string;
};

export default function PropertyPicker({ value = '', onChange, label = 'Select Property', error, helperText }: PropertyPickerProps) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<{ id: string, name: string }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;

    if (!open) {
      return undefined;
    }

    (async () => {
      setLoading(true);
      try {
        const propertiesRef = collection(db, 'properties');
        // Fetch a list of properties for the autocomplete
        const q = query(propertiesRef, limit(100));
        const snapshot = await getDocs(q);
        if (active) {
          const props = snapshot.docs.map(doc => ({
            id: doc.id,
            name: doc.data().name || doc.data().propertyName || doc.id
          }));
          setOptions(props);
        }
      } catch (err) {
        console.error('Error fetching properties for picker:', err);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [open]);

  const selectedOption = options.find((opt) => opt.id === value) || null;

  return (
    <Autocomplete
      id="property-picker"
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      isOptionEqualToValue={(option, val) => option.id === val.id}
      getOptionLabel={(option) => option.name}
      options={options}
      loading={loading}
      value={selectedOption}
      onChange={(event, newValue) => {
        onChange(newValue ? newValue.id : '', newValue ? newValue.name : '');
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          error={error}
          helperText={helperText}
          InputProps={{
            ...params.InputProps,
            endAdornment: (
              <React.Fragment>
                {loading ? <CircularProgress color="inherit" size={20} /> : null}
                {params.InputProps.endAdornment}
              </React.Fragment>
            ),
          }}
        />
      )}
    />
  );
}
