import { DataModel, DataField, isDataField } from '@arql/types';
import React from 'react';
import {
  Button,
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

export default function Fields({
  model,
  data,
  refresh,
}: {
  model: DataModel;
  data: Data;
  refresh: () => void;
}) {
  const [protoField, setProtoField] = React.useState<
    Partial<DataField> | undefined
  >();

  return (
    <TableContainer>
      <Typography variant="h6">Fields</Typography>
      <Table sx={{}} aria-label="Data Table">
        <TableHead>
          <TableRow>
            <TableCell>Name</TableCell>
            <TableCell align="right">Data Type</TableCell>
            <TableCell align="right">
              <Button variant="outlined" onClick={() => setProtoField({})}>
                <Add />
                Add
              </Button>
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {model?.fields.filter(isDataField).map((f) => (
            <TableRow
              key={f.name}
              sx={{
                '&:last-child td, &:last-child th': { border: 0 },
              }}
            >
              <TableCell component="th" scope="row">
                {f.name}
              </TableCell>
              <TableCell align="right">{f.datatype}</TableCell>
              <TableCell align="right">
                <Button
                  size="small"
                  onClick={() => data.removeField(f.name, model.name)}
                >
                  <Remove />
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {protoField && (
            <TableRow
              sx={{
                '&:last-child td, &:last-child th': { border: 0 },
              }}
            >
              <TableCell component="th" scope="row">
                <TextField
                  sx={{ flexGrow: 1 }}
                  size="small"
                  placeholder="Field Name"
                  value={protoField.name}
                  onChange={(e) =>
                    setProtoField({ ...protoField, name: e.target.value })
                  }
                />
              </TableCell>
              <TableCell align="right">
                <FormControl size="small" sx={{ minWidth: '120px' }}>
                  <InputLabel>Data Type</InputLabel>
                  <Select
                    sx={{ minWidth: '100px' }}
                    value={protoField.datatype}
                    size="small"
                    label="Data Type"
                    onChange={(e) =>
                      setProtoField({
                        ...protoField,
                        datatype: e.target.value as 'string' | 'number',
                      })
                    }
                  >
                    <MenuItem value="string">string</MenuItem>
                    <MenuItem value="number">number</MenuItem>
                  </Select>
                </FormControl>
              </TableCell>
              <TableCell align="right" sx={{ display: 'inline-flex' }}>
                <Stack direction="row" spacing={1}>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => {
                      data.addField(
                        protoField.name,
                        protoField.datatype,
                        model.name,
                        [...data.sources.entries()].find(
                          ([key, source]) => source === model.source
                        )[0]
                      );
                      setProtoField(undefined);
                    }}
                  >
                    <Add />
                    Add
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => setProtoField(undefined)}
                  >
                    Cancel
                  </Button>
                </Stack>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
