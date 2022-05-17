import { Add } from "@mui/icons-material";
import { Box, Button, Dialog, FormControl, InputLabel, MenuItem, Select, Stack, TextField, Typography } from "@mui/material";
import React from "react";
import { Data, getColourForSource } from "../../models";

export default function ModelCreator({
  data,
  open,
  setOpen,
  refresh,
}: {
  data: Data;
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  refresh: () => void;
}) {
  const [name, setName] = React.useState('');
  const [sourceName, setSourceName] = React.useState('');
  return (
    <Dialog open={open} onClose={() => setOpen(false)}>
      <Stack spacing={1} sx={{padding: 1}}>
        <TextField
          sx={{ flexGrow: 1 }}
          size="small"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <FormControl size="small" sx={{ minWidth: '120px' }}>
          <InputLabel>Source</InputLabel>
          <Select
            sx={{ minWidth: '100px' }}
            value={sourceName}
            size="small"
            label="Source"
            onChange={(e) => setSourceName(e.target.value)}
          >
            {[...data.sources.keys()].map((source) => (
              <MenuItem value={source} key={source} sx={{backgroundColor: getColourForSource(source)}}>
                {source}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Button onClick={() => {
          data.addModel(name, sourceName);
          refresh();
          setOpen(false);
        }}><Add/></Button>
      </Stack>
    </Dialog>
  )
}