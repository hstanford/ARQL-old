import { Add } from "@mui/icons-material";
import { Box, Button, Dialog, Stack, TextField, Typography } from "@mui/material";
import React from "react";
import { Data, getColourForSource } from "../../models";

export default function SourceCreator({
  data,
  open,
  setOpen,
}: {
  data: Data;
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const [name, setName] = React.useState('');
  return (
    <Dialog open={open} onClose={() => setOpen(false)}>
      <Stack sx={{}}>
        {[...data.sources.keys()].map((name) => {
          return (
            <Box key={name} sx={{backgroundColor: getColourForSource(name), padding: 2}}>
              <Typography variant="subtitle1">{name}</Typography>
            </Box>
          );
        })}
        <Stack direction="row">
          <TextField size="small" placeholder="Source name" value={name} onChange={(e) => setName(e.target.value)}/>
          <Button onClick={() => {
            data.addSource(name);
            setName('');
          }}><Add/></Button>
        </Stack>
      </Stack>
    </Dialog>
  )
}