import { Dialog, Box, Button, Stack, Typography } from '@mui/material';
import { DataObject as DataObjectIcon } from '@mui/icons-material';
import React from 'react';
import { Data, getColourForSource } from '../../models';
import { DataModel } from 'arql';
import Fields from './fields';
import Relationships from './relationships';

export default function Model({
  data,
  model,
  refresh,
  open,
  setOpen,
}: {
  data: Data;
  model: DataModel;
  refresh: () => void;
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  return (
    <Dialog open={open} onClose={() => setOpen(false)}>
      <Box
        padding={2}
        sx={{
          backgroundColor:
            getColourForSource(data.getKeyForSource(model.source)) + '33',
        }}
      >
        <Box
          sx={{
            flexGrow: 1,
          }}
        >
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
            <DataObjectIcon />
            <Typography variant="h5">{model.name}</Typography>
            <Button
              variant="contained"
              color="error"
              size="small"
              onClick={() => {
                data.removeModel(model.name);
                setOpen(false);
                refresh();
              }}
            >
              Remove
            </Button>
          </Stack>
          <Fields model={model} data={data} refresh={refresh} />
          <Relationships model={model} data={data} refresh={refresh} />
        </Box>
        <Box sx={{ display: 'flex' }}>
          <Button
            sx={{ marginLeft: 'auto' }}
            variant="outlined"
            onClick={() => setOpen(false)}
          >
            Close
          </Button>
        </Box>
      </Box>
    </Dialog>
  );
}
