import { DataModel, DataReference, isDataField, isDataReference } from '@arql/core';
import React from 'react';
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Add, Remove } from '@mui/icons-material';
import { Data } from '../../models';

import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';

export default function Relationships({
  model,
  data,
  refresh,
}: {
  model: DataModel;
  data: Data;
  refresh: () => void;
}) {
  const [newRow, setNewRow] = React.useState(false);
  const [name, setName] = React.useState<string>();
  const [otherName, setOtherName] = React.useState<string>();
  const [hasOne, setHasOne] = React.useState(false);
  const [modelCol, setModelCol] = React.useState<string>();
  const [otherCol, setOtherCol] = React.useState<string>();

  const clear = () => {
    setNewRow(false);
    setName('');
    setOtherName('');
    setHasOne(false);
    setModelCol('');
    setOtherCol('');
  };

  return (
    <>
      <TableContainer>
        <Typography variant="h6">Relationships</Typography>
        <Table sx={{}} aria-label="Data Table">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Target Model</TableCell>
              <TableCell align="right">Transforms</TableCell>
              <TableCell align="right">
                <Button variant="outlined" onClick={() => setNewRow(true)}>
                  <Add />
                  Add
                </Button>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {model?.fields.filter(isDataReference).map((f) => (
              <TableRow
                key={f.name}
                sx={{
                  '&:last-child td, &:last-child th': { border: 0 },
                }}
              >
                <TableCell component="th" scope="row">
                  {f.name}
                </TableCell>
                <TableCell component="th" scope="row">
                  {f.other.name}
                </TableCell>
                <TableCell align="left">
                  <Box
                    sx={{
                      fontFamily: 'monaco',
                      backgroundColor: 'white',
                      padding: 1,
                      borderRadius: '4px',
                      whiteSpace: 'nowrap',
                      overflow: 'scroll',
                      maxWidth: '200px',
                    }}
                  >
                    {f.join(model.name, f.other.name)}
                  </Box>
                </TableCell>
                <TableCell align="right">
                  <Button
                    size="small"
                    onClick={() => {
                      data.removeField(f.name, model.name);
                      refresh();
                    }}
                  >
                    <Remove />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {newRow && (
        <Stack spacing={1}>
          <TextField
            sx={{ flexGrow: 1 }}
            size="small"
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <FormControl size="small" sx={{ minWidth: '120px' }}>
            <InputLabel>Field</InputLabel>
            <Select
              sx={{ minWidth: '100px' }}
              value={modelCol}
              size="small"
              label="Field"
              onChange={(e) => setModelCol(e.target.value)}
            >
              {model.fields.filter(isDataField).map((field) => (
                <MenuItem value={field.name} key={field.name}>
                  {field.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Stack direction="row" sx={{ alignItems: 'center' }}>
            <InputLabel>Many to one</InputLabel>
            <Checkbox
              onChange={(e) => setHasOne(e.target.checked)}
              checked={hasOne}
            />
          </Stack>
          <FormControl size="small" sx={{ minWidth: '120px' }}>
            <InputLabel>Other Model</InputLabel>
            <Select
              sx={{ minWidth: '100px' }}
              value={otherName}
              size="small"
              label="Other Model"
              onChange={(e) => setOtherName(e.target.value)}
            >
              {[...data.models.keys()].map((key) => (
                <MenuItem value={key} key={key}>
                  {key}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: '120px' }}>
            <InputLabel>Other Field</InputLabel>
            <Select
              sx={{ minWidth: '100px' }}
              value={otherCol}
              size="small"
              label="Other Field"
              onChange={(e) => setOtherCol(e.target.value)}
            >
              {(data.models.get(otherName)?.fields || [])
                .filter(isDataField)
                .map((field) => (
                  <MenuItem value={field.name} key={field.name}>
                    {field.name}
                  </MenuItem>
                ))}
            </Select>
          </FormControl>
          <Button
            size="small"
            variant="outlined"
            onClick={() => {
              data.addRelation(
                name,
                model.name,
                hasOne,
                otherName,
                modelCol,
                otherCol
              );
              clear();
              refresh();
            }}
          >
            <Add />
            Add
          </Button>
          <Button size="small" onClick={() => clear()} variant="outlined">
            Cancel
          </Button>
        </Stack>
      )}
    </>
  );
}
